import app from "@/app";
import { ENV } from "@/config/env";
import { logger } from "@/config/logger";
import prisma from "@/config/database";
import { WebSocketService } from "@/services/websocket.service";

const server = app.listen(ENV.PORT, () => {
  logger.info(`Server running on port ${ENV.PORT} in ${ENV.NODE_ENV} mode`);
});

// Initialize WebSocket service
WebSocketService.getInstance(server);

// Graceful shutdown handler
const shutdown = async () => {
  logger.info("Shutdown signal received");

  // Add WebSocket cleanup
  const wsService = WebSocketService.getInstance();
  wsService.broadcast({ type: 'shutdown', data: { message: 'Server shutting down' } });
  
  // Add connection draining
  app.disable('connection'); // Stop accepting new connections
  
  // Add timeout for existing connections
  const connectionDrainTimeout = setTimeout(() => {
    logger.warn('Connection drain timeout reached, forcing shutdown');
    process.exit(1);
  }, 10000);
  
  server.close(async () => {
    logger.info("HTTP server closed");

    try {
      await prisma.$disconnect();
      logger.info("Database connections closed");

      process.exit(0);
    } catch (err) {
      logger.error("Error during shutdown:", err);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default server;
