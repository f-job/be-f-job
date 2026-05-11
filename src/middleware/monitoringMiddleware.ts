import { Request, Response } from "express";
import { MetricsService } from "@/services/metrics.service";
import responseTime from "response-time";
import { logger } from "@/config/logger";

const metricsService = new MetricsService();

export const metricsMiddleware = responseTime((req: Request, res: Response, time: number) => {
  try {
    let route = req.route?.path || req.path || "/unknown";
    
    if (req.params) {
      Object.keys(req.params).forEach(param => {
        route = route.replace(req.params[param], `:${param}`);
      });
    }
    
    if (route.startsWith('/monitoring/metrics')) {
      return;
    }

    metricsService.recordHttpRequest(
      req.method,
      route,
      res.statusCode,
      time / 1000
    );

    if (res.statusCode >= 400) {
      metricsService.recordHttpError(
        req.method,
        route,
        res.statusCode
      );
    }

    const now = Date.now();
    if (!lastStatsUpdate || now - lastStatsUpdate >= 15000) {
      metricsService.updateNodeStats();
      lastStatsUpdate = now;
    }

  } catch (error) {
    logger.error('Error recording metrics', { error });
  }
});

let lastStatsUpdate: number | null = null;
