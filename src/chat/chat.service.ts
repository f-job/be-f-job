import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,

    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // ─── GET /conversations ─────────────────────────────────────────────────────

  /**
   * Returns the paginated, sorted conversation list for the calling user.
   *
   * Pipeline:
   *  1. $match  — conversations where caller is a participant AND not hidden
   *  2. $sort   — updatedAt DESC (most recently active first)
   *  3. $lookup — join User collection to hydrate participant name + email
   *  4. $project — strip sensitive fields; expose a clean participant array
   *
   * The $lookup uses a pipeline sub-stage to select only safe fields,
   * preventing accidental password/token exposure in the response.
   */
  async getConversations(userId: string) {
    const userObjectId = new Types.ObjectId(userId);

    const conversations = await this.conversationModel.aggregate([
      // ── Stage 1: Membership + visibility filter ────────────────────────────
      {
        $match: {
          participants: userObjectId,
          hiddenBy:     { $ne: userObjectId },
        },
      },

      // ── Stage 2: Most recently active first ───────────────────────────────
      { $sort: { updatedAt: -1 } },

      // ── Stage 3: Hydrate participant profiles ─────────────────────────────
      {
        $lookup: {
          from:         'users',
          localField:   'participants',
          foreignField: '_id',
          as:           'participantDetails',
          pipeline: [
            {
              $project: {
                _id:      1,
                fullName: 1,
                email:    1,
                role:     1,
                // avatarUrl would be projected here once the field exists on User
              },
            },
          ],
        },
      },

      // ── Stage 4: Shape the response document ──────────────────────────────
      {
        $project: {
          __v:             0,
          hiddenBy:        0,            // Never expose who else hid the channel
          participantDetails: {
            password:             0,
            refreshTokenHash:     0,
            passwordResetTokenHash: 0,
          },
        },
      },
    ]);

    return { data: conversations };
  }

  // ─── GET /conversations/unread-count ────────────────────────────────────────

  /**
   * Returns the global count of unread messages sent to the calling user
   * across ALL their active (visible) conversations.
   *
   * Strategy:
   *  1. Resolve the caller's conversation IDs (excluding hidden channels).
   *  2. Count Message documents where:
   *     - conversationId is in that set
   *     - senderId is NOT the caller (you can't have unread messages you sent)
   *     - isRead = false
   *
   * This two-step approach avoids a heavyweight $lookup inside the messages
   * collection and keeps both queries hitting their respective compound indexes.
   */
  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const userObjectId = new Types.ObjectId(userId);

    // Step 1 — Resolve active conversation IDs for this user
    const activeConversations = await this.conversationModel
      .find(
        {
          participants: userObjectId,
          hiddenBy:     { $ne: userObjectId },
        },
        { _id: 1 },
      )
      .lean();

    const conversationIds = activeConversations.map((c) => c._id);

    if (conversationIds.length === 0) {
      return { count: 0 };
    }

    // Step 2 — Count unread messages the caller received
    const count = await this.messageModel.countDocuments({
      conversationId: { $in: conversationIds },
      senderId:       { $ne: userObjectId },
      isRead:         false,
    });

    return { count };
  }

  // ─── GET /conversations/:id ──────────────────────────────────────────────────

  /**
   * Returns a single conversation metadata block for the calling user.
   *
   * Guards:
   *   ERR_4001 — Conversation not found.
   *   ERR_2001 — Caller is not a member of this conversation.
   */
  async getConversation(
    userId:         string,
    conversationId: string,
  ): Promise<ConversationDocument> {
    const conversation = await this.conversationModel
      .findById(conversationId)
      .populate('participants', 'fullName email role')
      .lean();

    if (!conversation) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Conversation with ID "${conversationId}" was not found.`,
      });
    }

    this.assertMembership(conversation.participants as any[], userId);

    return conversation as unknown as ConversationDocument;
  }

  // ─── POST /conversations ─────────────────────────────────────────────────────

  /**
   * Initializes a new bilateral conversation between the calling user and a
   * specified recipient.
   *
   * Business rules:
   *  - The caller and recipient must form a CANDIDATE ↔ EMPLOYER pair.
   *    Both USER roles are validated via the User collection before creation.
   *  - A caller may not start a conversation with themselves.
   *  - If a channel between the same two users already exists (regardless of
   *    whether it was hidden), it is returned as-is (idempotent).
   *  - If a hidden conversation is re-opened, the caller is removed from
   *    hiddenBy so it reappears in their list.
   *
   * Guards:
   *   ERR_3001 — Caller and recipient are the same user.
   *   ERR_4001 — Recipient user not found.
   *   ERR_3002 — Invalid participant role pair.
   */
  async createConversation(
    callerId: string,
    dto:      CreateConversationDto,
  ): Promise<ConversationDocument> {
    const callerObjectId    = new Types.ObjectId(callerId);
    const recipientObjectId = new Types.ObjectId(dto.recipientId);

    // Guard: no self-conversations
    if (callerObjectId.equals(recipientObjectId)) {
      throw new BadRequestException({
        errorCode: 'ERR_3001',
        message:   'You cannot start a conversation with yourself.',
      });
    }

    // Load both users to validate roles
    const [caller, recipient] = await Promise.all([
      this.userModel.findById(callerObjectId).select('role').lean(),
      this.userModel.findById(recipientObjectId).select('role').lean(),
    ]);

    if (!recipient) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Recipient user with ID "${dto.recipientId}" was not found.`,
      });
    }

    // Enforce CANDIDATE ↔ EMPLOYER pair constraint
    this.assertValidParticipantPair(caller!.role, recipient.role);

    // Idempotency: return existing conversation if one already exists
    const existing = await this.conversationModel
      .findOne({
        participants: { $all: [callerObjectId, recipientObjectId], $size: 2 },
      })
      .populate('participants', 'fullName email role')
      .lean();

    if (existing) {
      // If caller had previously hidden it, un-hide it now
      if (
        (existing.hiddenBy as Types.ObjectId[]).some((id) =>
          id.equals(callerObjectId),
        )
      ) {
        await this.conversationModel.updateOne(
          { _id: existing._id },
          { $pull: { hiddenBy: callerObjectId } },
        );
      }
      return existing as unknown as ConversationDocument;
    }

    // Create the new conversation channel
    const conversation = await this.conversationModel.create({
      participants:  [callerObjectId, recipientObjectId],
      latestMessage: null,
      hiddenBy:      [],
    });

    return this.conversationModel
      .findById(conversation._id)
      .populate('participants', 'fullName email role')
      .lean() as unknown as ConversationDocument;
  }

  // ─── GET /conversations/:id/messages ────────────────────────────────────────

  /**
   * Returns a paginated, reverse-chronological list of messages for the
   * specified conversation.
   *
   * Guards:
   *   ERR_4001 — Conversation not found.
   *   ERR_2001 — Caller is not a member.
   */
  async getMessages(
    userId:         string,
    conversationId: string,
    dto:            QueryMessagesDto,
  ) {
    await this.assertConversationMembership(userId, conversationId);

    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 20;
    const skip  = (page - 1) * limit;

    const conversationObjectId = new Types.ObjectId(conversationId);

    const [data, total] = await Promise.all([
      this.messageModel
        .find({ conversationId: conversationObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderId', 'fullName email')
        .lean(),
      this.messageModel.countDocuments({ conversationId: conversationObjectId }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── POST /conversations/:id/messages ───────────────────────────────────────

  /**
   * Persists a new message document and atomically updates the parent
   * Conversation's `latestMessage` snapshot and `updatedAt` timestamp.
   *
   * Returns the full created Message document (populated senderId).
   *
   * Guards:
   *   ERR_4001 — Conversation not found.
   *   ERR_2001 — Caller is not a member.
   */
  async sendMessage(
    userId:         string,
    conversationId: string,
    dto:            SendMessageDto,
  ): Promise<MessageDocument> {
    await this.assertConversationMembership(userId, conversationId);

    const senderObjectId       = new Types.ObjectId(userId);
    const conversationObjectId = new Types.ObjectId(conversationId);

    // Create the message document
    const message = await this.messageModel.create({
      conversationId: conversationObjectId,
      senderId:       senderObjectId,
      text:           dto.text,
      isRead:         false,
      readAt:         null,
    });

    // Atomically refresh the conversation latestMessage + bump updatedAt
    await this.conversationModel.findByIdAndUpdate(conversationObjectId, {
      $set: {
        latestMessage: {
          text:      dto.text,
          senderId:  senderObjectId,
          createdAt: new Date(),
        },
        updatedAt: new Date(),
      },
    });

    // Return the hydrated message with sender details
    return this.messageModel
      .findById(message._id)
      .populate('senderId', 'fullName email')
      .lean() as unknown as MessageDocument;
  }

  // ─── PUT /conversations/:id/messages/:messageId/read ────────────────────────

  /**
   * Marks a specific message as read and stamps the readAt timestamp.
   *
   * Business rule: only the message RECIPIENT (non-sender) may mark a message
   * as read.  This mirrors real-world read receipts where the sender cannot
   * self-acknowledge their own message.
   *
   * The operation is idempotent — calling it on an already-read message is
   * a safe no-op that returns the current state.
   *
   * Guards:
   *   ERR_4001 — Conversation or message not found.
   *   ERR_2001 — Caller is not a member / is the sender.
   */
  async markMessageRead(
    userId:         string,
    conversationId: string,
    messageId:      string,
  ): Promise<MessageDocument> {
    await this.assertConversationMembership(userId, conversationId);

    const message = await this.messageModel
      .findOne({
        _id:            new Types.ObjectId(messageId),
        conversationId: new Types.ObjectId(conversationId),
      })
      .lean();

    if (!message) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Message with ID "${messageId}" was not found in this conversation.`,
      });
    }

    // Only the recipient (non-sender) may mark as read
    if (message.senderId.toString() === userId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You cannot mark your own message as read.',
      });
    }

    // Idempotent — skip DB write if already read
    if (!message.isRead) {
      await this.messageModel.updateOne(
        { _id: new Types.ObjectId(messageId) },
        { $set: { isRead: true, readAt: new Date() } },
      );
    }

    return this.messageModel
      .findById(messageId)
      .populate('senderId', 'fullName email')
      .lean() as unknown as MessageDocument;
  }

  // ─── DELETE /conversations/:id ───────────────────────────────────────────────

  /**
   * Soft-hides a conversation from the calling user's view by adding their
   * userId to the `hiddenBy` array.
   *
   * Uses `$addToSet` to remain idempotent on repeated calls.
   * The conversation document is never hard-deleted.
   *
   * Guards:
   *   ERR_4001 — Conversation not found.
   *   ERR_2001 — Caller is not a member.
   */
  async hideConversation(userId: string, conversationId: string): Promise<void> {
    await this.assertConversationMembership(userId, conversationId);

    await this.conversationModel.updateOne(
      { _id: new Types.ObjectId(conversationId) },
      { $addToSet: { hiddenBy: new Types.ObjectId(userId) } },
    );
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Loads the conversation by ID and verifies the calling user is a participant.
   * Throws ERR_4001 if not found, ERR_2001 if not a member.
   * Returns the lean conversation document.
   */
  private async assertConversationMembership(
    userId:         string,
    conversationId: string,
  ): Promise<ConversationDocument> {
    const conversation = await this.conversationModel
      .findById(conversationId)
      .lean();

    if (!conversation) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Conversation with ID "${conversationId}" was not found.`,
      });
    }

    this.assertMembership(conversation.participants as Types.ObjectId[], userId);

    return conversation as unknown as ConversationDocument;
  }

  /**
   * Inline membership guard used after a populated participants array is
   * already in memory.  Avoids a redundant DB round-trip.
   */
  private assertMembership(
    participants: Array<{ _id?: Types.ObjectId } | Types.ObjectId>,
    userId: string,
  ): void {
    const isMember = participants.some((p) => {
      const id = (p as any)._id ?? p;
      return id.toString() === userId;
    });

    if (!isMember) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have access to this conversation.',
      });
    }
  }

  /**
   * Enforces the CANDIDATE ↔ EMPLOYER pair constraint for new conversations.
   * Allows any order (caller may be either role) but rejects same-role pairs
   * and disallows ADMIN or USER roles from initiating a conversation.
   *
   * Valid pairs:
   *   CANDIDATE + EMPLOYER  ✓
   *   EMPLOYER + CANDIDATE  ✓
   *
   * Invalid pairs (ERR_3002):
   *   CANDIDATE + CANDIDATE
   *   EMPLOYER + EMPLOYER
   *   USER + any
   *   ADMIN + any
   */
  private assertValidParticipantPair(
    callerRole:    UserRole,
    recipientRole: UserRole,
  ): void {
    const allowedRoles = new Set<UserRole>([UserRole.CANDIDATE, UserRole.EMPLOYER]);

    const isValid =
      allowedRoles.has(callerRole) &&
      allowedRoles.has(recipientRole) &&
      callerRole !== recipientRole;

    if (!isValid) {
      throw new BadRequestException({
        errorCode: 'ERR_3002',
        message:
          'Conversations may only be created between a CANDIDATE and an EMPLOYER.',
      });
    }
  }

  // ─── Gateway helpers (called by ChatGateway) ─────────────────────────────────

  /**
   * Resolves the recipient's userId from a conversation document.
   * Used by the gateway to determine which user room to emit `newMessage` to.
   *
   * Returns null if the conversation is not found or the caller is the only
   * participant (data-integrity edge case).
   */
  async getRecipientId(
    senderId:       string,
    conversationId: string,
  ): Promise<string | null> {
    const conversation = await this.conversationModel
      .findById(conversationId)
      .select('participants')
      .lean();

    if (!conversation) return null;

    const recipient = (conversation.participants as Types.ObjectId[]).find(
      (p) => p.toString() !== senderId,
    );

    return recipient ? recipient.toString() : null;
  }
}
