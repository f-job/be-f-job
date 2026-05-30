import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConversationsController } from './conversations.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';

/**
 * ChatModule — Feature module encapsulating all real-time messaging concerns.
 *
 * Registered providers:
 *   • ConversationsController — HTTP REST layer (8 endpoints)
 *   • ChatService             — Business logic and MongoDB operations
 *   • ChatGateway             — Socket.io WebSocket gateway (/chat namespace)
 *
 * External module dependencies:
 *   • JwtModule (registerAsync) — Required by ChatGateway to verify JWT tokens
 *     during the Socket.io handshake without delegating to Passport (Passport
 *     is not available in the WebSocket execution context).
 *   • UsersModule               — Exposes UsersService for recipient validation
 *     and participant role lookups during conversation initialization.
 *   • NotificationsModule       — Exposes NotificationsService for offline
 *     fallback notification dispatch from the gateway.
 *
 * Collections registered:
 *   • conversations  (ConversationSchema)
 *   • messages       (MessageSchema)
 *   • users          (UserSchema — read-only, for role lookups in ChatService)
 */
@Module({
  imports: [
    // ── Mongoose collections ────────────────────────────────────────────────
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name,      schema: MessageSchema },
      // Register User model here so ChatService can query roles directly
      // without going through UsersService for every sendMessage call.
      { name: User.name,         schema: UserSchema },
    ]),

    // ── JWT for WebSocket handshake verification ────────────────────────────
    // Uses the same secret / expiry as the AuthModule JWT registration so
    // tokens issued by the auth flow are accepted by the gateway.
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret:       configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m',
        },
      }),
      inject: [ConfigService],
    }),

    // ── Feature module dependencies ─────────────────────────────────────────
    UsersModule,          // Provides UsersService (exported by UsersModule)
    NotificationsModule,  // Provides NotificationsService (exported by NotificationsModule)
  ],

  controllers: [ConversationsController],

  providers: [
    ChatService,
    ChatGateway,
  ],

  // Export ChatService in case other modules (e.g. ApplicationsModule) need
  // to programmatically send system messages when an application status changes.
  exports: [ChatService],
})
export class ChatModule {}
