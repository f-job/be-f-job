import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/appError";
import { ApiResponse } from "@/utils/apiResponse";
import { logger } from "@/config/logger";
import { MetricsService } from "@/services/metrics.service";

const metricsService = new MetricsService();

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error({
    message: error.message,
    stack: error.stack,
    context: "ErrorHandler",
  });

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const route = req.route?.path || req.path || "/unknown";
  
  metricsService.recordHttpRequest(
    req.method,
    route,
    statusCode,
    0
  );

  if (error instanceof AppError) {
    ApiResponse.error(res, error.message, error.statusCode);
    return;
  }

  ApiResponse.error(res, "Internal server error", 500);
};
