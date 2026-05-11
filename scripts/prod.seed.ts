import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
const prisma = new PrismaClient();

async function main() {
  // In production, we might want to be more careful about seeding
  // Only seed if the table is empty
  const userCount = await prisma.user.count();

  if (userCount === 0) {
    // Create initial admin user
    const hashedPassword = await bcrypt.hash("Password123!", 10);
    const adminUser = await prisma.user.create({
      data: {
        name: "Admin User",
        email: "admin@express-boilerplate.com",
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    console.log("Production seed completed:", adminUser);
  } else {
    console.log("Skipping production seed - data already exists");
  }
}

main()
  .catch((e) => {
    console.error("Error seeding production data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
