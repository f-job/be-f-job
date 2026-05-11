import { PrismaClient } from "@prisma/client";
import request from "supertest";
import app from "@/app";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
  // Clean database at start
  await prisma.$transaction([prisma.user.deleteMany()]);
});

beforeEach(async () => {
  // Clean database before each test
  await prisma.$transaction([prisma.user.deleteMany()]);
});

afterAll(async () => {
  await prisma.$transaction([prisma.user.deleteMany()]);
  await prisma.$disconnect();
});

export const testApp = request(app);
export { prisma };
