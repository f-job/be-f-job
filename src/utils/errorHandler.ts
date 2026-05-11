import { AppError } from "./appError";
import { logger } from "@/config/logger";
import { ErrorCode } from "./errorCodes";
import { Prisma } from "@prisma/client";

export class ErrorHandler {
  static handle(error: unknown, context: string) {
    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(error);
      logger.warn("Prisma error occurred", {
        message: prismaError.message,
        context,
        code: prismaError.code,
        statusCode: prismaError.statusCode,
        prismaCode: error.code,
        meta: error.meta, // Include Prisma metadata
      });
      return prismaError;
    }

    if (error instanceof AppError) {
      logger.warn("Application error occurred", {
        message: error.message,
        context,
        code: error.code,
        statusCode: error.statusCode,
        details: error.details,
        stack: error.stack,
      });
      return error;
    }

    // Log unknown errors
    const unknownError = new AppError(
      "Internal server error",
      500,
      ErrorCode.INTERNAL_SERVER_ERROR,
      false
    );

    logger.error("Unknown error occurred", {
      message: error instanceof Error ? error.message : "Unknown error",
      context,
      error: error instanceof Error ? error.stack : JSON.stringify(error),
      details: error instanceof Error ? error : undefined,
    });

    return unknownError;
  }

  private static handlePrismaError(
    error: Prisma.PrismaClientKnownRequestError
  ): AppError {
    switch (error.code) {
      case "P2002":
        return new AppError(
          "Resource already exists",
          409,
          ErrorCode.ALREADY_EXISTS
        );
      case "P2025":
        return new AppError("Resource not found", 404, ErrorCode.NOT_FOUND);
      default:
        return new AppError("Database error", 500, ErrorCode.DB_ERROR, false);
    }
  }
}

// Add more specific error types
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, ErrorCode.VALIDATION_ERROR);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 500, ErrorCode.DB_ERROR);
  }
}
