import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The set of trust-and-safety actions captured in the append-only audit trail.
 *
 * Each value records an admin- or lifecycle-driven decision so that moderation,
 * verification, reporting, and application-lifecycle activity is fully
 * traceable (Req 15.1, 15.2).
 */
export enum AuditAction {
  REVIEW_HIDDEN          = 'REVIEW_HIDDEN',
  REVIEW_RESTORED        = 'REVIEW_RESTORED',
  VERIFICATION_APPROVED  = 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED  = 'VERIFICATION_REJECTED',
  REPORT_RESOLVED        = 'REPORT_RESOLVED',
  REPORT_DISMISSED       = 'REPORT_DISMISSED',
  APPLICATION_COMPLETED  = 'APPLICATION_COMPLETED',
  APPLICATION_NOSHOW     = 'APPLICATION_NOSHOW',
}

/**
 * Identifies the kind of entity an {@link AuditAction} was performed against,
 * so the `targetId` can be resolved to the correct collection.
 */
export enum AuditTargetType {
  REVIEW       = 'REVIEW',
  USER         = 'USER',
  REPORT       = 'REPORT',
  APPLICATION  = 'APPLICATION',
}

// ─────────────────────────────────────────────────────────────────────────────
// toJSON transform
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips the internal Mongoose `__v` version key from serialized output,
 * matching the `toJSON` transform convention used across the codebase.
 */
const stripV = (_doc: any, ret: any) => {
  delete ret.__v;
  return ret;
};

// ─────────────────────────────────────────────────────────────────────────────
// AuditLog Document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append-only audit record for trust-and-safety actions (review moderation,
 * application lifecycle transitions, verification decisions, report
 * resolutions). Captures the actor, action, target, timestamp, and reason.
 *
 * Append-only design (Req 15.3): only `createdAt` is tracked (no `updatedAt`),
 * and there is no service/API surface to update or delete records.
 *
 * Indexes (compound):
 *   - { actorId, action, createdAt } → filterable trail by actor + action (Req 15.4).
 *   - { targetId, createdAt }        → trail for a given target, newest first.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false }, // append-only: never updated
  collection: 'audit_logs',
  toJSON: {
    virtuals: true,
    transform: stripV,
  },
})
export class AuditLog extends Document {
  /**
   * The user who performed the action (User._id). Indexed for actor-filtered
   * audit queries (Req 15.1, 15.2).
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  actorId: Types.ObjectId;

  /** The trust-and-safety action that was performed. */
  @Prop({ required: true, enum: AuditAction, index: true })
  action: AuditAction;

  /** The kind of entity the action targeted. */
  @Prop({ required: true, enum: AuditTargetType })
  targetType: AuditTargetType;

  /**
   * Identifier of the affected entity (Review/User/Report/Application _id),
   * resolved against the collection implied by `targetType`. Indexed for
   * target-filtered audit queries (Req 15.4).
   */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  /** Optional human-readable reason captured with the action (≤1000 chars). */
  @Prop({ trim: true, maxlength: 1000 })
  reason?: string;

  /**
   * Arbitrary structured context for the action — e.g.
   * `{ fromStatus, toStatus }` for lifecycle transitions.
   */
  @Prop({ type: Object, default: null })
  metadata?: Record<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// ─── Indexes ────────────────────────────────────────────────────────────────

// Req 15.4: filterable audit trail by actor + action, newest first.
AuditLogSchema.index({ actorId: 1, action: 1, createdAt: -1 });

// Trail for a specific target, newest first.
AuditLogSchema.index({ targetId: 1, createdAt: -1 });
