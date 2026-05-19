import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private generateRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async hashData(data: string): Promise<string> {
    const saltRounds = this.configService.get<number>('BCRYPT_SALT_ROUNDS') || 10;
    return bcrypt.hash(data, saltRounds);
  }

  private getTokens(userId: string, email: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
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

  // ─── Core Logic ────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existingUser = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await this.hashData(dto.password);

    const newUser = new this.userModel({
      fullName: dto.fullName || undefined,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
    });

    await newUser.save();
    return { message: 'Registration successful' };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+password')
      .exec();

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.getTokens(user._id.toString(), user.email);
    user.refreshTokenHash = await this.hashData(refreshToken);
    await user.save();

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
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
