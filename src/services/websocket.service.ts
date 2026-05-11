import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { ErrorMonitoringService } from './errorMonitoring.service';
import { MetricsService } from '@/services/metrics.service';
import { singleton } from '@/decorators/singleton';

export interface WebSocketMessage {
  type: 'ping' | 'pong' | 'error' | 'connection';
  data: unknown;
}

@singleton
export class WebSocketService {
  private static instance: WebSocketService;
  private wss!: WebSocketServer;
  private metricsService: MetricsService;

  constructor() {
    this.metricsService = new MetricsService();
  }

  public static getInstance(server?: Server): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
      if (server) {
        WebSocketService.instance.initialize(server);
      }
    }
    return WebSocketService.instance;
  }

  private initialize(server: Server): void {
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', (ws: WebSocket) => {
      this.metricsService.recordWebsocketConnection(true);
      
      ws.on('close', () => {
        this.metricsService.recordWebsocketConnection(false);
      });

      ws.on('message', (message: string) => {
        this.metricsService.recordWebsocketMessage('message', 'in');
      });
    });
  }

  // Rest of the WebSocket service implementation...
} 