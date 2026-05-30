import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MessageDocument = HydratedDocument<Message>;

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents a single message posted inside a Conversation channel.
 *
 * Read-state lifecycle:
 *   - `isRead` defaults to `false` at creation time.
 *   - When the recipient calls PUT /conversations/:id/messages/:messageId/read,
 *     `isRead` is set to `true` and `readAt` is stamped with the current Date.
 *   - Only the non-sender participant may mutate the read-state — the service
 *     layer enforces this guard (ERR_2001 on violation).
 *
 * Indexes:
 *   - { conversationId: 1, createdAt: -1 } — primary paginated list query
 *     (covered index: all required fields available without document fetch)
 *   - { conversationId: 1, isRead: 1 }    — fast unread count per conversation
 *   - { senderId: 1 }                      — audit / sender message history
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false }, // only createdAt is semantically meaningful
  collection: 'messages',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Message {
  /**
   * The Conversation channel this message belongs to.
   * Indexed as part of the compound { conversationId, createdAt } index.
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
  })
  conversationId: Types.ObjectId;

  /**
   * The User who authored this message.
   * Used for role-guarded read-state mutations (only recipient may mark read).
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  senderId: Types.ObjectId;

  /**
   * The plain-text body of the message.
   * Hard-capped at 2 000 characters to bound document size.
   * Trimmed at the schema level; further sanitization is performed in the DTO.
   */
  @Prop({
    required: true,
    trim: true,
    maxlength: 2000,
  })
  text: string;

  /**
   * Read-state flag.  Defaults to `false` (unread) at creation.
   * Mutated to `true` when the recipient acknowledges the message via
   * PUT /conversations/:id/messages/:messageId/read.
   */
  @Prop({ default: false })
  isRead: boolean;

  /**
   * ISO timestamp capturing the exact moment the recipient marked this
   * message as read.  Remains `null` until `isRead` is flipped to `true`.
   */
  @Prop({ type: Date, default: null })
  readAt: Date | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// ── Indexes ───────────────────────────────────────────────────────────────────

/**
 * Index 1 — Primary paginated list query.
 * GET /conversations/:id/messages sorts messages within a conversation by
 * creation time descending.  The compound index covers the full query shape
 * without a collection scan.
 */
MessageSchema.index({ conversationId: 1, createdAt: -1 });

/**
 * Index 2 — Unread count aggregation.
 * Powers the global unread badge: count documents where conversationId is in
 * the caller's conversation set AND isRead = false AND senderId ≠ caller.
 */
MessageSchema.index({ conversationId: 1, isRead: 1 });

/**
 * Index 3 — Sender audit trail.
 * Supports message history queries filtered by author if needed in future
 * admin / moderation tooling.
 */
MessageSchema.index({ senderId: 1 });
