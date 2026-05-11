import WebSocket from 'ws';
import app from '@/app';
import { createServer } from 'http';
import { WebSocketService } from '@/services/websocket.service';

const TEST_PORT = 4400;

describe('WebSocket Tests', () => {
  jest.setTimeout(10000);

  let ws: WebSocket;
  let server = createServer(app);

  beforeAll(async () => {
    return new Promise<void>((resolve) => {
      server.listen(TEST_PORT, () => {
        WebSocketService.getInstance(server);
        resolve();
      });
    });
  });

  afterAll(async () => {
    return new Promise<void>((resolve) => {
      ws?.close();
      (WebSocketService as any).instance = null;
      server.close(() => resolve());
    });
  });

  beforeEach(async () => {
    return new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });
  });

  afterEach(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  it('should receive connection confirmation', (done) => {
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      expect(message.type).toBe('connection');
      expect(message.data).toHaveProperty('clientId');
      done();
    });
  });

  it('should handle ping-pong', (done) => {
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'pong') {
        expect(message.data).toHaveProperty('timestamp');
        done();
      }
    });

    ws.send(JSON.stringify({ type: 'ping' }));
  });
}); 