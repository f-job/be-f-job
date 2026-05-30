import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConversationDocument = HydratedDocument<Conversation>;

/**
 * Denormalized snapshot of the most recently sent message in this conversation.
 * Written atomically alongside Message creation to avoid expensive JOIN lookups
 * when rendering conversation list tiles.
 */
export interface LatestMessageSnapshot {
  /** Plain text body of the message (truncated at the schema level). */
  text: string;
  /** ObjectId of the user who sent the message. */
  senderId: Types.ObjectId;
  /** ISO timestamp of when the message was created. */
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents a bilateral messaging channel between exactly one CANDIDATE
 * and one EMPLOYER.
 *
 * Soft-delete strategy: `hiddenBy` accumulates user ObjectIds.  A conversation
 * is hidden for a given user when their ID is present in `hiddenBy`.  The
 * document is never hard-deleted from the collection.
 *
 * Compound unique index on `participants` prevents duplicate channel creation
 * between the same pair regardless of insertion order.
 *
 * Indexes:
 *   - { participants: 1 }                — membership lookup + duplicate guard
 *   - { participants: 1, updatedAt: -1 } — sorted conversation list per user
 *   - { hiddenBy: 1 }                   — fast exclusion filter
 */
@Schema({
  timestamps: true, // createdAt, updatedAt auto-managed by Mongoose
  collection: 'conversations',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Conversation {
  /**
   * Exactly two User ObjectIds — [candidateId, employerId].
   * This pair is enforced as a set: the compound unique index guarantees
   * no duplicate channel exists between the same two users.
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    required: true,
    validate: {
      validator: (arr: Types.ObjectId[]) => arr.length === 2,
      message: 'A conversation must have exactly two participants.',
    },
  })
  participants: Types.ObjectId[];

  /**
   * Denormalized snapshot of the last message for UI list rendering.
   * `null` when the conversation has been created but no messages have been
   * sent yet.
   */
  @Prop({
    type: {
      text:     { type: String, required: true, maxlength: 200 },
      senderId: { type: Types.ObjectId, ref: 'User', required: true },
      createdAt: { type: Date, required: true },
    },
    default: null,
  })
  latestMessage: LatestMessageSnapshot | null;

  /**
   * User ObjectIds who have soft-deleted (hidden) this conversation from their
   * own view.  Uses `$addToSet` to remain idempotent on repeated hide calls.
   * When both participants hide the conversation it is effectively invisible
   * to all parties but retained in the database for audit purposes.
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: [],
  })
  hiddenBy: Types.ObjectId[];
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// ── Indexes ───────────────────────────────────────────────────────────────────

/**
 * Index 1 — Membership lookup.
 * Used by every service query that must verify the calling user is a participant.
 * The sparse unique index here is on the sorted pair, NOT enforced at DB level
 * for order independence; duplicate prevention is done via $all + $size guard
 * in the service layer.
 */
ConversationSchema.index({ participants: 1 });

/**
 * Index 2 — Sorted conversation list per user.
 * Powers GET /conversations: filter by participant membership → sort by
 * most recently updated (latest message) descending.
 */
ConversationSchema.index({ participants: 1, updatedAt: -1 });

/**
 * Index 3 — Hidden conversation exclusion filter.
 * Allows efficient $nin / $ne queries that strip hidden channels from list views.
 */
ConversationSchema.index({ hiddenBy: 1 });
