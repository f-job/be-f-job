import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ENV } from "@/config/env";
import { AppError } from "@/utils/appError";
import { logger } from "@/config/logger";
import { ErrorCode } from "@/utils/errorCodes";
import crypto from "crypto";
import { EmailService } from "./email.service";

const prisma = new PrismaClient();

export class AuthService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  private generateVerificationToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  async signup(email: string, name: string, password: string) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError("Email already exists", 400, ErrorCode.ALREADY_EXISTS);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = this.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(email, name, verificationToken);

    return user;
  }

  async verifyEmail(token: string) {
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: {
          gt: new Date(),
        },
        emailVerified: null,
      },
    });

    if (!user) {
      throw new AppError(
        "Invalid or expired verification token",
        400,
        ErrorCode.INVALID_TOKEN
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return { message: "Email verified successfully" };
  }

  private async cleanupExpiredTokens() {
    await prisma.user.updateMany({
      where: {
        emailVerificationExpires: {
          lt: new Date(),
        },
        emailVerified: null,
      },
      data: {
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
  }

  async resendVerificationEmail(email: string) {
    // Clean up expired tokens first
    await this.cleanupExpiredTokens();
    
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
    }

    if (user.emailVerified) {
      throw new AppError(
        "Email is already verified",
        400,
        ErrorCode.INVALID_REQUEST
      );
    }

    const verificationToken = this.generateVerificationToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await this.emailService.sendVerificationEmail(
      user.email,
      user.name,
      verificationToken
    );

    return { message: "Verification email sent" };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      throw new AppError(
        "Invalid credentials",
        401,
        ErrorCode.INVALID_CREDENTIALS
      );
    }

    if (!user.emailVerified) {
      throw new AppError(
        "Please verify your email before logging in",
        401,
        ErrorCode.UNAUTHORIZED
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError(
        "Invalid credentials",
        401,
        ErrorCode.INVALID_CREDENTIALS
      );
    }

    const accessToken = this.generateAccessToken(user.id, user.role);
    const refreshToken = this.generateRefreshToken(user.id);

    // Store refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new AppError(
        "Refresh token is required",
        400,
        ErrorCode.INVALID_TOKEN
      );
    }

    try {
      const decoded = jwt.verify(refreshToken, ENV.REFRESH_TOKEN_SECRET) as {
        userId: string;
      };

      logger.debug("Processing refresh token request", {
        userId: decoded.userId,
        context: "AuthService.refresh",
      });

      const user = await prisma.user.findFirst({
        where: {
          id: decoded.userId,
          refreshToken: refreshToken,
        },
      });

      if (!user) {
        throw new AppError(
          "Invalid refresh token",
          401,
          ErrorCode.INVALID_TOKEN
        );
      }

      const accessToken = this.generateAccessToken(user.id, user.role);
      const newRefreshToken = this.generateRefreshToken(user.id);

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefreshToken },
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      logger.error("Refresh token error", {
        error,
        context: "AuthService.refresh",
      });
      throw new AppError("Invalid refresh token", 401, ErrorCode.INVALID_TOKEN);
    }
  }

  async logout(userId: string) {
    if (!userId) {
      throw new AppError("User ID is required", 400, ErrorCode.INVALID_INPUT);
    }

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });
    } catch (error) {
      logger.error("Logout error", {
        error,
        userId,
        context: "AuthService.logout",
      });
      throw new AppError(
        "Failed to logout",
        500,
        ErrorCode.INTERNAL_SERVER_ERROR
      );
    }
  }

  private generateAccessToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, ENV.JWT_SECRET, {
      expiresIn: ENV.JWT_EXPIRY,
    });
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign({ userId }, ENV.REFRESH_TOKEN_SECRET, {
      expiresIn: ENV.REFRESH_TOKEN_EXPIRY,
    });
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
    }

    const resetToken = this.generateVerificationToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    try {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        user.name,
        resetToken
      );
      return { message: "Password reset email sent" };
    } catch (error) {
      // If email fails, clear the reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new AppError(
        "Invalid or expired reset token",
        400,
        ErrorCode.INVALID_TOKEN
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return { message: "Password reset successfully" };
  }
}
