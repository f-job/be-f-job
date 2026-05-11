import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.user.deleteMany({});

  // Create development test users
  const hashedPassword = await bcrypt.hash("Password123!", 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: "John Doe",
        email: "john@example.com",
        password: hashedPassword,
        role: "ADMIN",
      },
    }),
    prisma.user.create({
      data: {
        name: "Jane Smith",
        email: "jane@example.com",
        password: hashedPassword,
      },
    }),
    prisma.user.create({
      data: {
        name: "Bob Johnson",
        email: "bob@example.com",
        password: hashedPassword,
      },
    }),
  ]);

  console.log("Development seed completed:", users);
}

main()
  .catch((e) => {
    console.error("Error seeding development data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
