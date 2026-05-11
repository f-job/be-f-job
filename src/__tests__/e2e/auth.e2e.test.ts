import { testApp } from "../setup.e2e";
import prisma from "@/config/database";
import bcrypt from "bcrypt";

describe("Auth endpoints", () => {
  beforeEach(async () => {
    // Clean database before each test
    await prisma.$transaction([prisma.user.deleteMany()]);
  });

  describe("POST /api/auth/signup", () => {
    it("should create a new user", async () => {
      const response = await testApp.post("/api/auth/signup").send({
        email: "test@example.com",
        name: "Test User",
        password: "Password123!",
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty("id");
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash("Password123!", 10);

      // Create test user with all required fields
      await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          password: hashedPassword,
          role: "USER",
          emailVerified: null,
          image: null,
          refreshToken: null,
        },
      });

      // Wait a bit to ensure user is created
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should login successfully", async () => {
      const response = await testApp.post("/api/auth/login").send({
        email: "test@example.com",
        password: "Password123!",
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty("accessToken");
    });
  });

  describe("Email verification", () => {
    it("should verify email with valid token", async () => {
      // Create user with verification token
      const user = await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          password: await bcrypt.hash("Password123!", 10),
          emailVerificationToken: "test-token",
          emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const response = await testApp
        .get("/api/auth/verify-email/test-token")
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Check user is verified
      const verifiedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(verifiedUser?.emailVerified).toBeTruthy();
    });
  });

  describe("Password Reset", () => {
    beforeEach(async () => {
      await prisma.user.deleteMany();
    });

    it("should send password reset email", async () => {
      // Create a user first
      const user = await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          password: await bcrypt.hash("Password123!", 10),
          emailVerified: new Date(),
        },
      });

      const response = await testApp
        .post("/api/auth/forgot-password")
        .send({ email: "test@example.com" })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify token was created
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.passwordResetToken).toBeTruthy();
      expect(updatedUser?.passwordResetExpires).toBeTruthy();
    });

    it("should reset password with valid token", async () => {
      // Create user with reset token
      const resetToken = "test-reset-token";
      const user = await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          password: await bcrypt.hash("OldPassword123!", 10),
          passwordResetToken: resetToken,
          passwordResetExpires: new Date(Date.now() + 3600000), // 1 hour
          emailVerified: new Date(),
        },
      });

      const response = await testApp
        .post(`/api/auth/reset-password/${resetToken}`)
        .send({ password: "NewPassword123!" })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify password was changed
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.passwordResetToken).toBeNull();
      expect(updatedUser?.passwordResetExpires).toBeNull();

      // Verify can login with new password
      const loginResponse = await testApp
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "NewPassword123!",
        })
        .expect(200);

      expect(loginResponse.body.data.accessToken).toBeTruthy();
    });

    it("should not reset password with expired token", async () => {
      // Create user with expired reset token
      await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
          password: await bcrypt.hash("Password123!", 10),
          passwordResetToken: "expired-token",
          passwordResetExpires: new Date(Date.now() - 3600000), // 1 hour ago
          emailVerified: new Date(),
        },
      });

      const response = await testApp
        .post("/api/auth/reset-password/expired-token")
        .send({ password: "NewPassword123!" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("ERR_1004"); // INVALID_TOKEN
    });
  });
});
