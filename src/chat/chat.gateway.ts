import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Payload Types
// ─────────────────────────────────────────────────────────────────────────────

interface SendMessagePayload {
  conversationId: string;
  text: string;
}

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email:  string;
    role:   string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ChatGateway — Real-time messaging over Socket.io.
 *
 * Namespace : /chat
 * Transport : WebSocket (with polling fallback)
 *
 * Room Strategy — User Personal Rooms:
 *   Each authenticated user joins a personal room named `user:<userId>` on
 *   connection.  Outbound `newMessage` events are emitted to:
 *     • `user:<recipientId>` — delivers to the recipient (all their open tabs)
 *     • `user:<senderId>`    — reflects the message back to the sender's other
 *                              open tabs for multi-device sync
 *
 * Connected Socket Registry:
 *   A Map<userId, Set<socketId>> tracks which users currently have at least
 *   one open socket.  This enables the offline-fallback detection:
 *   if a recipient's entry is missing or empty, `NotificationsService` is
 *   called to persist an in-app notification.
 *
 * JWT Handshake:
 *   Clients must provide a valid access token in the Socket.io handshake:
 *     socket = io('/chat', { auth: { token: '<jwt>' } })
 *   Alternatively accepted from the Authorization header:
 *     Authorization: Bearer <jwt>
 *   Failed verification disconnects the socket immediately with an
 *   `exception` event before any event handler runs.
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    /**
     * CORS origin is resolved lazily via a function so that the runtime
     * ConfigService value is evaluated at connection time, not at module
     * boot.  Falls back to `*` (all origins) when NODE_ENV is not production,
     * which is safe for local development but must not reach production.
     */
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, true); // actual origin check delegated to allowedOrigins below
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /**
   * In-memory registry: userId → Set of active socketIds.
   * Used for offline-fallback detection inside handleSendMessage.
   * NOTE: This is a single-process registry.  In a multi-instance deployment
   * this should be replaced with a Redis Pub/Sub presence map.
   */
  private readonly connectedSockets = new Map<string, Set<string>>();

  /** Resolved allowed origins cached at init time. */
  private allowedOrigins: string[] = [];

  constructor(
    private readonly chatService:          ChatService,
    private readonly jwtService:           JwtService,
    private readonly configService:        ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Lifecycle: Init ──────────────────────────────────────────────────────

  afterInit(_server: Server): void {
    const env           = this.configService.get<string>('NODE_ENV') ?? 'development';
    const frontendUrl   = this.configService.get<string>('FRONTEND_URL');

    if (env === 'production' && frontendUrl) {
      this.allowedOrigins = [frontendUrl];
    } else {
      this.allowedOrigins = ['*']; // Development — open CORS
    }

    this.logger.log(
      `ChatGateway initialized on namespace /chat | env=${env} | origins=${this.allowedOrigins.join(', ')}`,
    );
  }

  // ─── Lifecycle: Connection ────────────────────────────────────────────────

  /**
   * Fires when a client establishes a raw Socket.io connection.
   *
   * Flow:
   *  1. Extract JWT from handshake.auth.token or Authorization header.
   *  2. Verify and decode the JWT using JwtService.
   *  3. Attach decoded payload to socket.data for downstream handlers.
   *  4. Join the user's personal room `user:<userId>`.
   *  5. Register socket in connectedSockets map.
   *  6. On any failure: emit `exception` event + disconnect.
   */
  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractToken(socket);

      if (!token) {
        throw new WsException('Missing authentication token.');
      }

      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify<{
        sub:   string;
        email: string;
        role:  string;
      }>(token, { secret: jwtSecret });

      // Attach user context to socket data for use in event handlers
      socket.data.userId = payload.sub;
      socket.data.email  = payload.email;
      socket.data.role   = payload.role;

      // Validate CORS origin in production
      const requestOrigin = socket.handshake.headers.origin;
      if (
        this.allowedOrigins[0] !== '*' &&
        requestOrigin &&
        !this.allowedOrigins.includes(requestOrigin)
      ) {
        throw new WsException(`Origin "${requestOrigin}" is not allowed.`);
      }

      // Join personal user room for targeted message delivery
      const userRoom = `user:${payload.sub}`;
      await socket.join(userRoom);

      // Register in presence map
      if (!this.connectedSockets.has(payload.sub)) {
        this.connectedSockets.set(payload.sub, new Set());
      }
      this.connectedSockets.get(payload.sub)!.add(socket.id);

      this.logger.log(
        `[CONNECT] socketId=${socket.id} userId=${payload.sub} room=${userRoom}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[CONNECT REJECTED] socketId=${socket.id} reason=${err?.message ?? 'unknown'}`,
      );
      socket.emit('exception', {
        errorCode: 'ERR_1001',
        message:   err?.message ?? 'Authentication failed.',
      });
      socket.disconnect(true);
    }
  }

  // ─── Lifecycle: Disconnection ─────────────────────────────────────────────

  /**
   * Fires when a socket closes (client navigates away, network drop, etc.).
   * Removes the socket from the presence map.  If no sockets remain for this
   * user, their entry is deleted, making them appear "offline".
   */
  handleDisconnect(socket: AuthenticatedSocket): void {
    const userId = socket.data?.userId;

    if (userId) {
      const sockets = this.connectedSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          this.connectedSockets.delete(userId);
        }
      }

      this.logger.log(
        `[DISCONNECT] socketId=${socket.id} userId=${userId}`,
      );
    }
  }

  // ─── Event: sendMessage ───────────────────────────────────────────────────

  /**
   * Handles the `sendMessage` event emitted by clients.
   *
   * Payload: { conversationId: string; text: string }
   *
   * Flow:
   *  1. Validate that conversationId and text are present.
   *  2. Persist the message via ChatService.sendMessage().
   *  3. Resolve the recipient's userId via ChatService.getRecipientId().
   *  4. Emit `newMessage` to the recipient's personal room.
   *  5. Emit `newMessage` back to the sender's personal room (multi-tab sync).
   *  6. If the recipient has NO active sockets (offline): create an in-app
   *     notification via NotificationsService as a fallback alert.
   *  7. On error: emit `exception` back to the calling socket only.
   *
   * The handler uses try/catch to prevent unhandled promise rejections from
   * crashing the gateway process.
   */
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: SendMessagePayload,
  ): Promise<void> {
    const senderId = socket.data?.userId;

    if (!senderId) {
      socket.emit('exception', {
        errorCode: 'ERR_1001',
        message:   'Unauthenticated socket.',
      });
      return;
    }

    try {
      // ── 1. Payload validation ──────────────────────────────────────────────
      if (!payload?.conversationId || !payload?.text?.trim()) {
        throw new WsException(
          'Payload must include a non-empty conversationId and text.',
        );
      }

      // ── 2. Persist message ─────────────────────────────────────────────────
      const savedMessage = await this.chatService.sendMessage(
        senderId,
        payload.conversationId,
        { text: payload.text.trim() },
      );

      // ── 3. Resolve recipient ───────────────────────────────────────────────
      const recipientId = await this.chatService.getRecipientId(
        senderId,
        payload.conversationId,
      );

      if (!recipientId) {
        throw new WsException('Unable to resolve message recipient.');
      }

      // Construct the event payload sent to both rooms
      const newMessageEvent = {
        conversationId: payload.conversationId,
        message:        savedMessage,
      };

      // ── 4. Emit to recipient's personal room ───────────────────────────────
      this.server
        .to(`user:${recipientId}`)
        .emit('newMessage', newMessageEvent);

      // ── 5. Reflect back to sender's other tabs ────────────────────────────
      this.server
        .to(`user:${senderId}`)
        .emit('newMessage', newMessageEvent);

      // ── 6. Offline fallback notification ──────────────────────────────────
      const isRecipientOnline =
        this.connectedSockets.has(recipientId) &&
        this.connectedSockets.get(recipientId)!.size > 0;

      if (!isRecipientOnline) {
        this.logger.log(
          `[OFFLINE FALLBACK] recipientId=${recipientId} conversationId=${payload.conversationId}`,
        );

        // Fire-and-forget: do NOT await — notification failure must never block
        // the message delivery confirmation
        this.notificationsService
          .createAndDispatch(recipientId, {
            type:     NotificationType.RECRUITMENT_MESSAGE,
            title:    'New message received',
            body:     this.truncateForNotification(payload.text),
            metadata: {
              conversationId: payload.conversationId,
              senderId,
            },
          })
          .catch((err) => {
            this.logger.error(
              `[OFFLINE FALLBACK] Failed to create notification for recipientId=${recipientId}: ${err?.message}`,
            );
          });
      }

      this.logger.log(
        `[MESSAGE] conversationId=${payload.conversationId} senderId=${senderId} recipientId=${recipientId} online=${isRecipientOnline}`,
      );
    } catch (err: any) {
      this.logger.error(
        `[MESSAGE ERROR] socketId=${socket.id} userId=${senderId} error=${err?.message}`,
      );
      socket.emit('exception', {
        errorCode: err?.errorCode ?? 'ERR_5001',
        message:   err?.message ?? 'Failed to send message.',
      });
    }
  }

  // ─── Public presence query (used by other services if needed) ────────────

  /**
   * Returns true if the given userId has at least one active socket connection.
   * Exposed publicly so other gateways or services can check online status
   * without accessing the private Map directly.
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.connectedSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Extracts the JWT string from either:
   *   a) socket.handshake.auth.token  (preferred — set via { auth: { token } })
   *   b) socket.handshake.headers.authorization  (Bearer scheme fallback)
   *
   * Returns undefined if neither source provides a token.
   */
  private extractToken(socket: Socket): string | undefined {
    // Source A — auth object (Socket.io v4 recommended approach)
    const authToken = (socket.handshake as any).auth?.token as string | undefined;
    if (authToken) return authToken;

    // Source B — HTTP Authorization header
    const authHeader = socket.handshake.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return undefined;
  }

  /**
   * Truncates a message body to a safe length for use in notification body
   * text.  Notifications cap at 500 characters per the Notification schema.
   */
  private truncateForNotification(text: string, maxLength = 120): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
  }
}
