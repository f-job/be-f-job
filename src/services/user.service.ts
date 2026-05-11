import { PrismaClient } from "@prisma/client";
import { AppError } from "@/utils/appError";

const prisma = new PrismaClient();

export class UserService {
  async getAllUsers(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    return await prisma.user.findMany({
      take: limit,
      skip,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }

  async updateUser(
    id: string,
    data: Partial<{
      name: string;
      email: string;
      role: "ADMIN" | "USER";
    }>
  ) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteUser(id: string) {
    await prisma.user.delete({
      where: { id },
    });
  }

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role?: "ADMIN" | "USER";
  }) {
    return prisma.user.create({
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
