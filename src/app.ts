import express from "express";
import { ENV } from "@/config/env";
import userRoutes from "@/routes/user.routes";
import authRoutes from "@/routes/auth.routes";
import { errorHandler } from "@/middleware/errorHandler";
import { setupSecurityHeaders } from "@/middleware/securityHeaders";
import { apiLimiter } from "@/middleware/rateLimiter";
import { authLimiter } from "@/middleware/rateLimiter";
import cors from "cors";
import { requestId } from "@/middleware/requestId";
import { loggingMiddleware } from "@/middleware/loggingMiddleware";
import { compressionMiddleware } from "@/middleware/performanceMiddleware";
import { cache } from "@/middleware/cacheMiddleware";
import { metricsMiddleware } from "@/middleware/monitoringMiddleware";
import monitoringRoutes from "@/routes/monitoring.routes";
import { ErrorMonitoringService } from "@/services/errorMonitoring.service";
import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import swaggerUi from 'swagger-ui-express';
import { specs } from './docs/swagger';
import { notFoundHandler } from './middleware/notFound';

const app = express();

// Initialize error monitoring
ErrorMonitoringService.getInstance();

// Group middleware by function
const setupMiddleware = (app: express.Application) => {
  // Security
  app.use(requestId);
  setupSecurityHeaders(app as express.Express);
  app.use(cors({ origin: ENV.FRONTEND_URL, credentials: true }));
  
  // Performance
  app.use(compressionMiddleware);
  app.use(express.json({ limit: "10kb" }));
  
  // Monitoring
  app.use(loggingMiddleware);
  app.use(metricsMiddleware);
  
  // Rate Limiting
  app.use("/api/auth", authLimiter);
  app.use("/api", apiLimiter);
};

setupMiddleware(app);

// Routes
app.get("/", (req, res) => {
  res.json({ message: "🚀 Hello from express-boilerplate Backend!" });
});

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Move Swagger docs before error handler
const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true
  },
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Express TypeScript API Documentation"
};

// Move monitoring routes before error handler
app.use("/api/monitoring", monitoringRoutes);

// Add Swagger documentation route at root level
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(specs, swaggerOptions));

// Error Handler should be last
const errorMiddleware: ErrorRequestHandler = (err, req, res, next) => {
  return errorHandler(err, req, res, next);
};

app.use(errorMiddleware);

// Move cache middleware before error handler
app.use("/api/users", cache({ duration: 300 }));

// Monitoring routes
app.use("/monitoring", monitoringRoutes);

// Add this as the last middleware (before error handler)
app.use(notFoundHandler);

export default app;
