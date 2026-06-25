import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserDocument, UserRole, AuthProvider } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterCandidateDto } from './dto/register-candidate.dto';
import { RegisterEmployerDto } from './dto/register-employer.dto';
import { CandidatesService } from '../candidates/candidates.service';
import { EmployerService } from '@/employers/employers.service';
import { OAuthValidationService, OAuthProfile } from './oauth.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly candidatesService: CandidatesService,
    private readonly employersService: EmployerService,
    private readonly oauthValidationService: OAuthValidationService,
  ) { }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private generateRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async hashData(data: string): Promise<string> {
    const saltRounds = this.configService.get<number>('BCRYPT_SALT_ROUNDS') || 10;
    return bcrypt.hash(data, saltRounds);
  }

  private getTokens(userId: string, email: string, role: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email, role },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
      },
    );

    return { accessToken, refreshToken };
  }

  private async createUser(
    email: string,
    password: string | null,
    role: UserRole,
    fullName?: string,
    provider = AuthProvider.LOCAL,
    providerId?: string,
    emailVerified = false,
  ): Promise<UserDocument> {
    try {
      return await this.userModel.create({
        email: email.trim().toLowerCase(),
        password,
        role,
        fullName,
        provider,
        providerId,
        emailVerified,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('Email đã được sử dụng');
      }
      throw error;
    }
  }

  // ─── Core Logic ────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const hashedPassword = await this.hashData(dto.password);
    await this.createUser(dto.email, hashedPassword, UserRole.USER, dto.fullName);
    return { message: 'Registration successful' };
  }

  async registerCandidate(dto: RegisterCandidateDto) {
    const hashedPassword = await this.hashData(dto.password);
    const user = await this.createUser(dto.email, hashedPassword, UserRole.CANDIDATE);

    try {
      await this.candidatesService.createProfile(user._id.toString(), {
        fullName: dto.fullName,
        phone: dto.phone,
        address: dto.address,
        resumeUrl: dto.resumeUrl,
      });
    } catch (error) {
      await this.userModel.findByIdAndDelete(user._id);
      throw error;
    }

    return { message: 'Candidate registration successful' };
  }

  async registerEmployer(dto: RegisterEmployerDto) {
    const hashedPassword = await this.hashData(dto.password);
    const user = await this.createUser(dto.email, hashedPassword, UserRole.EMPLOYER);

    try {
      await this.employersService.createProfile(user._id.toString(), {
        companyName: dto.companyName,
        companyDescription: dto.companyDescription,
        website: dto.website,
        industry: dto.industry,
        companySize: dto.companySize,
        address: dto.address,
      });
    } catch (error) {
      await this.userModel.findByIdAndDelete(user._id);
      throw error;
    }

    return { message: 'Employer registration successful. Pending admin approval.' };
  }

  async handleOAuthLogin(provider: AuthProvider, profile: OAuthProfile) {
    let user = await this.userModel.findOne({ email: profile.email.toLowerCase() });

    if (user) {
      let needsSave = false;
      if (!user.emailVerified && profile.emailVerified) {
        user.emailVerified = true;
        needsSave = true;
      }
      if (user.provider === AuthProvider.LOCAL && profile.providerId) {
        user.provider = provider;
        user.providerId = profile.providerId;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }

      // Update avatar in candidate profile if picture is provided
      if (profile.picture && user.role === UserRole.CANDIDATE) {
        try {
          const candidateProfile = await this.candidatesService.findByUserId(user._id.toString());
          if (candidateProfile && candidateProfile.avatarUrl !== profile.picture) {
            await this.candidatesService.updateCandidateProfile(
              user._id.toString(),
              { avatarUrl: profile.picture },
              user._id.toString(),
              UserRole.ADMIN, // Use ADMIN role to bypass permission check
            );
          }
        } catch (error) {
          this.logger.warn(`Failed to update avatar for user ${user._id}: ${error}`);
        }
      }

      // ═══ CHECK IDENTITY VERIFICATION REQUIREMENT ═══
      // Allow login but CANDIDATE user will be redirected to verification by frontend
      // ADMIN and EMPLOYER do NOT need verification
      if (
        user.role === UserRole.CANDIDATE &&
        user.identityVerificationRequired &&
        !user.identityVerification?.isVerified
      ) {
        this.logger.warn(
          `Candidate ${user._id} logged in via OAuth without identity verification - will be prompted`,
        );
        // Don't throw - allow login but frontend will redirect to verification
      }
    } else {
      user = await this.createUser(
        profile.email,
        null,
        UserRole.CANDIDATE,
        profile.name,
        provider,
        profile.providerId,
        profile.emailVerified,
      );

      try {
        await this.candidatesService.createProfile(user._id.toString(), {
          fullName: profile.name,
          avatarUrl: profile.picture, // Save OAuth profile picture
        });
      } catch (error) {
        await this.userModel.findByIdAndDelete(user._id);
        throw error;
      }

      // ═══ NEW USER VIA OAUTH - ALLOW LOGIN BUT NEEDS VERIFICATION ═══
      // Create account, allow login, but frontend will redirect to verification
      this.logger.log(
        `New user ${user._id} registered via OAuth - will need identity verification`,
      );
      // Don't throw - allow login but mark as needing verification
    }

    const { accessToken, refreshToken } = this.getTokens(user._id.toString(), user.email, user.role);
    user.refreshTokenHash = await this.hashData(refreshToken);
    await user.save();

    // Get avatar URL from candidate profile if exists
    let avatarUrl: string | null = null;
    if (user.role === UserRole.CANDIDATE) {
      try {
        const candidateProfile = await this.candidatesService.findByUserId(user._id.toString());
        if (candidateProfile?.avatarUrl) {
          avatarUrl = candidateProfile.avatarUrl;
        }
      } catch (error) {
        // Ignore avatar fetch errors
      }
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName || profile.name,
        role: user.role,
        avatarUrl,
        needsVerification: user.role === UserRole.CANDIDATE && user.identityVerificationRequired && !user.identityVerification?.isVerified,
      }
    };
  }

  async oauthGoogle(token: string) {
    const profile = await this.oauthValidationService.verifyGoogleToken(token);
    return this.handleOAuthLogin(AuthProvider.GOOGLE, profile);
  }

  async oauthFacebook(token: string) {
    const profile = await this.oauthValidationService.verifyFacebookToken(token);
    return this.handleOAuthLogin(AuthProvider.FACEBOOK, profile);
  }

  async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+password')
      .exec();

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials (account may require OAuth login)');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // ═══ CHECK IDENTITY VERIFICATION REQUIREMENT ═══
    // Block login if CANDIDATE needs to complete identity verification first
    // ADMIN and EMPLOYER do NOT need verification
    if (
      user.role === UserRole.CANDIDATE &&
      user.identityVerificationRequired &&
      !user.identityVerification?.isVerified
    ) {
      this.logger.warn(
        `Candidate ${user._id} attempted to login without completing identity verification`,
      );
      throw new UnauthorizedException(
        'Bạn cần hoàn thành xác thực danh tính trước khi đăng nhập. Vui lòng check email để xác thực.',
      );
    }

    const { accessToken, refreshToken } = this.getTokens(user._id.toString(), user.email, user.role);
    user.refreshTokenHash = await this.hashData(refreshToken);
    await user.save();

    // Get avatar URL from candidate profile if exists
    let avatarUrl: string | null = null;
    if (user.role === UserRole.CANDIDATE) {
      try {
        const candidateProfile = await this.candidatesService.findByUserId(user._id.toString());
        if (candidateProfile?.avatarUrl) {
          avatarUrl = candidateProfile.avatarUrl;
        }
      } catch (error) {
        // Ignore avatar fetch errors
      }
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl,
      }
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.userModel.findById(userId).select('+refreshTokenHash').exec();

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    const isTokenMatched = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isTokenMatched) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { accessToken, refreshToken: newRefreshToken } = this.getTokens(
      user._id.toString(),
      user.email,
      user.role,
    );

    user.refreshTokenHash = await this.hashData(newRefreshToken);
    await user.save();

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      $unset: { refreshTokenHash: 1 },
    });
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { message: 'If this email exists, a reset link has been generated' };
    }

    const resetToken = this.generateRandomToken();
    user.passwordResetTokenHash = await this.hashData(resetToken);
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    await user.save();

    return {
      message: 'If this email exists, a reset link has been generated',
      // TODO: Remove this in production and integrate EmailService
      ...(this.configService.get('NODE_ENV') !== 'production' && { resetToken }),
    };
  }

  async resetPassword(dto: import('./dto/reset-password.dto').ResetPasswordDto) {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetTokenHash');

    if (!user || !user.passwordResetTokenHash) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const isTokenValid = await bcrypt.compare(dto.token, user.passwordResetTokenHash);
    if (!isTokenValid) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.password = await this.hashData(dto.newPassword);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return { message: 'Password reset successfully' };
  }
}
