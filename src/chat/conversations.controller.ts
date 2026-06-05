import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { IdentityVerificationGuard } from '../auth/guards/identity-verification.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// !! ROUTE ORDERING SAFEGUARD — DO NOT REORDER !!
//
// NestJS/Express resolves route handlers in DECLARATION ORDER.
// Static literal paths must be registered before dynamic /:param segments.
// Violating this causes string literals like "unread-count" to be parsed as
// MongoDB ObjectIds → ERR_3001 Bad Request on every call.
//
// Enforced declaration order in this controller:
//
//   STATIC routes  (no path parameters)
//   ────────────────────────────────────────────────────
//   1. GET  /conversations/unread-count       ← static — MUST be first /:id
//   2. GET  /conversations                    ← static
//   3. POST /conversations                    ← static
//
//   DYNAMIC routes  (after ALL statics)
//   ────────────────────────────────────────────────────
//   4. GET  /conversations/:id                ← dynamic
//   5. GET  /conversations/:id/messages       ← dynamic sub-resource
//   6. POST /conversations/:id/messages       ← dynamic sub-resource
//   7. PUT  /conversations/:id/messages/:messageId/read  ← deep dynamic
//   8. DELETE /conversations/:id              ← dynamic — MUST be last
//
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Chat & Messaging')
@ApiBearerAuth('access-token')
@Controller('conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversationsController {
  constructor(private readonly chatService: ChatService) {}

  // ─── 1. GET /conversations/unread-count ──────────────────────────────────────
  // STATIC — declared FIRST to prevent capture by /:id dynamic segment.

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get global unread message count',
    description:
      'Returns the total count of unread messages received by the calling user ' +
      'across ALL their active (non-hidden) conversations. ' +
      'Intended for the notification bell badge in the UI. ' +
      'Only messages where the caller is the RECIPIENT (not the sender) ' +
      'contribute to this count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count returned successfully.',
    schema: { example: { count: 7 } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  getUnreadCount(@CurrentUser() user: { id: any }) {
    return this.chatService.getUnreadCount(user.id.toString());
  }

  // ─── 2. GET /conversations ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List own conversations',
    description:
      'Returns the calling user\'s active conversation list, sorted by most ' +
      'recently updated (latest message) descending. ' +
      'Each conversation is populated with participant names and emails. ' +
      'Conversations the caller has soft-deleted are excluded.',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation list returned successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  getConversations(@CurrentUser() user: { id: any }) {
    return this.chatService.getConversations(user.id.toString());
  }

  // ─── 3. POST /conversations ───────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initialize a new conversation',
    description:
      'Creates a new bilateral conversation channel between the calling user ' +
      'and a specified recipient. ' +
      'The caller and recipient must form a strict CANDIDATE ↔ EMPLOYER pair. ' +
      'If a channel between the same two users already exists, it is returned ' +
      'instead of creating a duplicate (idempotent). ' +
      'If the caller had previously hidden the conversation, it is re-shown.',
  })
  @ApiResponse({
    status: 201,
    description: 'Conversation created or existing conversation returned.',
  })
  @ApiResponse({
    status: 400,
    description:
      'ERR_3001 — Self-conversation attempt. ' +
      'ERR_3002 — Invalid participant role pair (must be CANDIDATE ↔ EMPLOYER).',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Recipient user not found.' })
  createConversation(
    @CurrentUser() user: { id: any },
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(user.id.toString(), dto);
  }

  // ─── 4. GET /conversations/:id ───────────────────────────────────────────────
  // DYNAMIC — declared after all static routes.

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single conversation',
    description:
      'Returns the metadata block for one conversation. ' +
      'Throws ERR_4001 if the conversation does not exist. ' +
      'Throws ERR_2001 if the calling user is not a participant.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the conversation',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Conversation metadata returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller is not a participant.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Conversation not found.' })
  getConversation(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any },
  ) {
    return this.chatService.getConversation(user.id.toString(), id);
  }

  // ─── 5. GET /conversations/:id/messages ──────────────────────────────────────

  @Get(':id/messages')
  @ApiOperation({
    summary: 'List messages in a conversation',
    description:
      'Returns a paginated, newest-first list of messages inside the specified ' +
      'conversation. ' +
      'Use `page` and `limit` query parameters to navigate through history. ' +
      'Throws ERR_2001 if the caller is not a participant.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the conversation',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1,  description: 'Page number (1-indexed)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Message list returned with pagination meta.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller is not a participant.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Conversation not found.' })
  getMessages(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any },
    @Query() query: QueryMessagesDto,
  ) {
    return this.chatService.getMessages(user.id.toString(), id, query);
  }

  // ─── 6. POST /conversations/:id/messages ─────────────────────────────────────
  // REQUIRES IDENTITY VERIFICATION

  @Post(':id/messages')
  @UseGuards(IdentityVerificationGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a message (HTTP fallback)',
    description:
      'Persists a new message via HTTP REST — use this as a fallback when the ' +
      'WebSocket connection is unavailable. ' +
      'For real-time delivery, prefer the `sendMessage` Socket.io event instead. ' +
      'The created message document is returned in the response body. ' +
      'Requires identity verification (ERR_2004 if not verified).',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the target conversation',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 201, description: 'Message created and conversation updated.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid ObjectId or validation error.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller is not a participant. | ERR_2004 — Identity verification required.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Conversation not found.' })
  sendMessage(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any },
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user.id.toString(), id, dto);
  }

  // ─── 7. PUT /conversations/:id/messages/:messageId/read ──────────────────────

  @Put(':id/messages/:messageId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a message as read',
    description:
      'Stamps `isRead: true` and `readAt: <now>` on the specified message. ' +
      'Only the RECIPIENT (non-sender) may mark a message as read. ' +
      'This operation is idempotent — repeating it on an already-read message ' +
      'is a safe no-op. ' +
      'Throws ERR_2001 if the caller is the sender or not a participant.',
  })
  @ApiParam({ name: 'id',        description: 'MongoDB ObjectId of the conversation', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiParam({ name: 'messageId', description: 'MongoDB ObjectId of the message',      example: '665f1a2b3c4d5e6f7a8b9c0e' })
  @ApiResponse({ status: 200, description: 'Message marked as read.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller is sender or not a participant.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Conversation or message not found.' })
  markMessageRead(
    @Param('id',        ParseObjectIdPipe) id:        string,
    @Param('messageId', ParseObjectIdPipe) messageId: string,
    @CurrentUser() user: { id: any },
  ) {
    return this.chatService.markMessageRead(user.id.toString(), id, messageId);
  }

  // ─── 8. DELETE /conversations/:id ────────────────────────────────────────────
  // DYNAMIC — declared last to ensure no static routes are shadowed.

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hide (soft-delete) a conversation',
    description:
      'Adds the calling user\'s ID to the conversation\'s `hiddenBy` array, ' +
      'effectively removing it from their conversation list view. ' +
      'The conversation document and all messages are retained in the database. ' +
      'The operation is idempotent — repeating it has no additional effect. ' +
      'The other participant is unaffected and can still see the conversation. ' +
      'Re-opening the conversation (POST /conversations with the same recipient) ' +
      'removes the caller from `hiddenBy` automatically.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the conversation to hide',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 204, description: 'Conversation hidden successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller is not a participant.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Conversation not found.' })
  hideConversation(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any },
  ) {
    return this.chatService.hideConversation(user.id.toString(), id);
  }
}
