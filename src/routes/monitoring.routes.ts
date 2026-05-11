import { Router } from "express";
import { MonitoringController } from "@/controllers/monitoring.controller";
import { MetricsService } from "@/services/metrics.service";
import { requireAuth } from "@/middleware/authMiddleware";

const router = Router();
const metricsService = new MetricsService();
const monitoringController = new MonitoringController(metricsService);

/**
 * @swagger
 * tags:
 *   name: Monitoring
 *   description: System monitoring and health check endpoints
 */

/**
 * @swagger
 * /monitoring/metrics:
 *   get:
 *     summary: Get system metrics
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Prometheus metrics in text format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 */
router.get("/metrics", monitoringController.getMetrics); // TODO: Add Authentication

/**
 * @swagger
 * /monitoring/health:
 *   get:
 *     summary: Check system health
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: System health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 memoryUsage:
 *                   type: object
 */
router.get("/health", monitoringController.getHealth);

/**
 * @swagger
 * /monitoring/readiness:
 *   get:
 *     summary: Check if application is ready to handle traffic
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Application is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
router.get("/readiness", monitoringController.getReadiness);

/**
 * @swagger
 * /monitoring/liveness:
 *   get:
 *     summary: Check if application is alive
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Application is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
router.get("/liveness", monitoringController.getLiveness);

/**
 * @swagger
 * /monitoring/alerts:
 *   post:
 *     summary: Receive alerts from AlertManager
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               alerts:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Alert received and processed
 *       401:
 *         description: Unauthorized
 */
router.post("/alerts", monitoringController.handleAlert);

/**
 * @swagger
 * /monitoring/simulate-error:
 *   get:
 *     summary: Simulate random errors (for testing)
 *     tags: [Monitoring]
 *     responses:
 *       400:
 *         description: Bad Request Error
 *       500:
 *         description: Internal Server Error
 *       503:
 *         description: Service Unavailable
 */
router.get("/simulate-error", monitoringController.simulateError);

router.get("/trigger-gc", async (req, res) => {
  if (global.gc) {
    global.gc();
    res.json({ message: "GC triggered" });
  } else {
    res.status(400).json({ message: "GC not exposed. Run Node with --expose-gc flag" });
  }
});

router.get("/simulate-memory-leak", (req, res) => {
  const arr: any[] = [];
  for (let i = 0; i < 1000000; i++) {
    arr.push(new Array(1000).fill('test'));
  }
  res.json({ message: "Memory leak simulated" });
});

export default router;
