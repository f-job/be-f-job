import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type ReportDocument = HydratedDocument<Report>;

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identifies what a {@link Report} targets, so `targetId` can be resolved to the
 * correct collection (`jobs` for JOB, `users` for USER) (Req 10.1, 10.2).
 */
export enum ReportTargetType {
  JOB  = 'JOB',
  USER = 'USER',
}

/**
 * Review/enforcement lifecycle of a {@link Report}.
 *
 * Flow:
 *   OPEN → UNDER_REVIEW → RESOLVED | DISMISSED
 *
 * Active states (OPEN, UNDER_REVIEW) participate in the per-(reporter, target)
 * uniqueness guard (Req 13.2); RESOLVED and DISMISSED are terminal.
 */
export enum ReportStatus {
  OPEN         = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED     = 'RESOLVED',
  DISMISSED    = 'DISMISSED',
}

/**
 * The predefined set of report reason categories. A Report's `reason` must be
 * exactly one of these values (Req 10.3, 10.7).
 */
export enum ReportReason {
  SCAM          = 'SCAM',
  FAKE_JOB      = 'FAKE_JOB',
  ABUSE         = 'ABUSE',
  HARASSMENT    = 'HARASSMENT',
  INAPPROPRIATE = 'INAPPROPRIATE',
  SPAM          = 'SPAM',
  OTHER         = 'OTHER',
}

/**
 * The {@link ReportStatus} values considered "active" for the uniqueness guard:
 * a reporter may have at most one report in one of these states per target
 * (Req 13.2). Used by the service to keep the denormalised `active` flag in sync.
 */
export const ACTIVE_REPORT_STATUSES: readonly ReportStatus[] = [
  ReportStatus.OPEN,
  ReportStatus.UNDER_REVIEW,
];

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
// Report Document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A user-submitted complaint about a Job or another user (Req 10).
 *
 * Reporters file reports against fake/scam jobs or abusive users; admins review
 * them through the moderation queue and either resolve (blocking the target) or
 * dismiss them (Req 11).
 *
 * Data-integrity guard (Req 13.2): at most one *active* (OPEN | UNDER_REVIEW)
 * report may exist per (reporterId, targetType, targetId). This is enforced by a
 * partial unique index. MongoDB does not support `$in` inside a
 * `partialFilterExpression` (only equality, `$exists:true`, range, `$type`, and
 * top-level `$and`/`$or` are allowed), so — per the design's documented fallback
 * — we key the partial index on a denormalised `active` boolean that the service
 * keeps in sync with `status` (true while OPEN/UNDER_REVIEW, false once
 * RESOLVED/DISMISSED). The service-layer duplicate check (ERR_4002) remains the
 * primary guard; this index is the concurrency backstop (Req 13.3).
 */
@Schema({
  timestamps: true,
  collection: 'reports',
  toJSON: {
    virtuals: true,
    transform: stripV,
  },
})
export class Report extends Document {
  /**
   * The user who filed this report (User._id). Indexed for reporter-scoped
   * lookups and the active-report uniqueness guard (Req 10.1, 10.2, 13.2).
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId: Types.ObjectId;

  /** What kind of entity is being reported — a JOB or a USER (Req 10.1, 10.2). */
  @Prop({ required: true, enum: ReportTargetType })
  targetType: ReportTargetType;

  /**
   * Identifier of the reported entity — a Job._id (when targetType=JOB) or a
   * User._id (when targetType=USER). Indexed for target-scoped lookups and the
   * uniqueness guard (Req 13.2).
   */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  targetId: Types.ObjectId;

  /** The reason category for the report; exactly one predefined value (Req 10.3). */
  @Prop({ required: true, enum: ReportReason })
  reason: ReportReason;

  /** Optional free-text description, at most 1000 characters (Req 10.4). */
  @Prop({ trim: true, maxlength: 1000, default: '' })
  description: string;

  /** Current review/enforcement state. New reports start OPEN (Req 10.1, 10.2). */
  @Prop({ default: ReportStatus.OPEN, enum: ReportStatus, index: true })
  status: ReportStatus;

  /**
   * Denormalised "is this report active?" flag, kept in sync with `status` by the
   * service (true while OPEN/UNDER_REVIEW, false once terminal). Backs the partial
   * unique index that enforces the active-report uniqueness guard (Req 13.2),
   * since `$in` is not permitted in a partialFilterExpression. A pre-save hook
   * keeps it consistent for document saves; service-side atomic updates
   * (findOneAndUpdate) MUST also set this flag when transitioning `status`.
   */
  @Prop({ default: true })
  active: boolean;

  /** The admin who opened this report for handling (OPEN → UNDER_REVIEW) (Req 11.2). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedAdminId?: Types.ObjectId;

  /** Timestamp recorded when the report was assigned for review (Req 11.2). */
  @Prop({ type: Date })
  assignedAt?: Date;

  /** The admin who resolved or dismissed this report (Req 11.3–11.5). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedBy?: Types.ObjectId;

  /** Timestamp recorded when the report reached RESOLVED or DISMISSED (Req 11.3–11.5). */
  @Prop({ type: Date })
  resolvedAt?: Date;

  /** Reason captured on resolution/dismissal, at most 1000 characters (Req 11.5). */
  @Prop({ trim: true, maxlength: 1000 })
  resolutionReason?: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

// ─────────────────────────────────────────────────────────────────────────────
// Keep the denormalised `active` flag in sync with `status` on document saves.
// (Atomic findOneAndUpdate transitions in the service must set `active` in $set,
// since document middleware does not run for those.)
// ─────────────────────────────────────────────────────────────────────────────
ReportSchema.pre('save', function (next) {
  // `this` is the Report document being saved.
  (this as any).active = ACTIVE_REPORT_STATUSES.includes((this as any).status);
  next();
});

// ─── Indexes ────────────────────────────────────────────────────────────────

/**
 * Req 13.2: at most one ACTIVE (OPEN | UNDER_REVIEW) report per
 * (reporter, targetType, target). Keyed on the denormalised `active` flag
 * because `$in` is unsupported in a partialFilterExpression.
 */
ReportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

/**
 * Req 11.1: admin report queue — newest first, filterable by status / targetType.
 */
ReportSchema.index({ status: 1, targetType: 1, createdAt: -1 });
