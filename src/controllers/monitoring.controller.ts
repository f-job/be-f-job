import { Request, Response, NextFunction } from "express";
import { MetricsService } from "@/services/metrics.service";
import { BaseController } from "./base.controller";
import { logger } from "@/config/logger";
import { AppError } from "@/utils/appError";

export class MonitoringController extends BaseController {
  constructor(private metricsService: MetricsService) {
    super();
  }

  getMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.debug('Metrics endpoint called');
      
      // Set headers for Prometheus scraping
      res.set('Content-Type', this.metricsService.getContentType());
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      
      const metrics = await this.metricsService.getMetrics();
      logger.debug('Metrics generated', { metricsLength: metrics.length });
      
      res.send(metrics);
    } catch (error) {
      logger.error('Error generating metrics', { error });
      next(error);
    }
  };

  getHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      // Add more detailed health checks
      const health = {
        status: "ok",
        timestamp: new Date(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        nodeVersion: process.version,
        pid: process.pid
      };
      
      return health;
    });
  };

  getReadiness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      return { status: "ok" };
    });
  };

  getLiveness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      return { status: "ok" };
    });
  };

  handleAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      const alerts = req.body;

      return {
        status: "success",
        message: "Alert received and processed"
      };
    });
  };

  simulateError = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await this.handleRequest(req, res, next, async () => {
      const random = Math.random();
      
      if (random < 0.3) {
        throw new AppError("Simulated 500 Internal Server Error", 500);
      } else if (random < 0.6) {
        throw new AppError("Simulated 400 Bad Request", 400);
      } else {
        throw new AppError("Simulated 503 Service Unavailable", 503);
      }
    });
  };
}
