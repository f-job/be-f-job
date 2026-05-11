import { PrismaClient } from "@prisma/client";
import { ENV } from "@/config/env";

const prisma = new PrismaClient({
  // log only in development
  log: ENV.NODE_ENV === "development" ? ["query", "error", "warn"] : [],
  datasources: {
    db: {
      url: ENV.MYSQL_DATABASE_URL,
    },
  },
});

// Soft shutdown handler
const handleShutdown = async () => {
  console.log("Shutting down database connection");
  await prisma.$disconnect();
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

export default prisma;
