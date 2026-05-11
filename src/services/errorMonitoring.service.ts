import { logger } from "@/config/logger";
import { AppError, isAppError } from "@/utils/appError";
import { ErrorCode } from "@/utils/errorCodes";
import { ENV } from "@/config/env";

export class ErrorMonitoringService {
  private static instance: ErrorMonitoringService;

  private constructor() {
    process.on("uncaughtException", this.handleUncaughtException);
    process.on("unhandledRejection", this.handleUnhandledRejection);
  }

  public static getInstance(): ErrorMonitoringService {
    if (!ErrorMonitoringService.instance) {
      ErrorMonitoringService.instance = new ErrorMonitoringService();
    }
    return ErrorMonitoringService.instance;
  }

  public logError(error: Error | AppError, request?: any) {
    const errorLog = this.formatError(error, request);

    if (isAppError(error) && error.isOperational) {
      logger.warn(errorLog);
    } else {
      logger.error(errorLog);
    }

    // Here you could add integration with external error monitoring services
    // like Sentry, New Relic, etc.
  }

  private formatError(error: Error | AppError, request?: any) {
    const baseError = {
      message: error.message,
      stack: ENV.NODE_ENV === "development" ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    };

    if (isAppError(error)) {
      return {
        ...baseError,
        code: error.code,
        statusCode: error.statusCode,
        isOperational: error.isOperational,
        details: error.details,
        request: request
          ? {
              url: request.url,
              method: request.method,
              params: request.params,
              query: request.query,
              body: request.body,
              userId: request.user?.id,
            }
          : undefined,
      };
    }

    return baseError;
  }

  private handleUncaughtException = (error: Error) => {
    logger.error("UNCAUGHT EXCEPTION! Shutting down...", {
      error: this.formatError(error),
    });
    process.exit(1);
  };

  private handleUnhandledRejection = (reason: any) => {
    logger.error("UNHANDLED REJECTION! Shutting down...", {
      error: this.formatError(
        reason instanceof Error ? reason : new Error(String(reason))
      ),
    });
    process.exit(1);
  };
}

export const errorMonitoring = ErrorMonitoringService.getInstance();
