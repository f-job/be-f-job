import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * Direction of a review, identifying who is reviewing whom for a given
 * completed application.
 *
 *   CANDIDATE_TO_EMPLOYER — the candidate is reviewing the employer.
 *   EMPLOYER_TO_CANDIDATE — the employer is reviewing the candidate.
 *
 * The pair (applicationId, direction) is unique, enforcing the business rule
 * that each party may leave at most one review per application (Req 1.8, 13.1).
 */
export enum ReviewDirection {
  CANDIDATE_TO_EMPLOYER = 'CANDIDATE_TO_EMPLOYER',
  EMPLOYER_TO_CANDIDATE = 'EMPLOYER_TO_CANDIDATE',
}

// ─── toJSON transform ───────────────────────────────────────────────────────

/**
 * Strips the internal Mongoose version key (`__v`) from serialised documents,
 * matching the established convention used across the codebase's schemas.
 */
const stripV = (_doc: unknown, ret: Record<string, any>) => {
  delete ret.__v;
  return ret;
};

// ─── Schema ───────────────────────────────────────────────────────────────────

@Schema({
  timestamps: true,
  collection: 'reviews',
  toJSON: {
    virtuals: true,
    transform: stripV,
  },
})
export class Review extends Document {
  // ── Context ─────────────────────────────────────────────────────────────────

  /**
   * The completed application this review is tied to.
   * References the `applications` collection (Application._id).
   * Indexed and part of the unique (applicationId, direction) compound index.
   */
  @Prop({ type: Types.ObjectId, ref: 'Application', required: true, index: true })
  applicationId: Types.ObjectId;

  /**
   * The author of the review (User._id) — either the candidate or the
   * job's employer depending on direction.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reviewerId: Types.ObjectId;

  /**
   * The subject of the review (User._id) — the party being rated.
   * Indexed for the public reviewee list query.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  revieweeId: Types.ObjectId;

  /**
   * Who is reviewing whom. Combined with applicationId, uniquely identifies
   * a single review (Req 1.8, 13.1).
   */
  @Prop({ required: true, enum: ReviewDirection })
  direction: ReviewDirection;

  /**
   * The job the application targeted. Denormalised here for read context
   * so review lists can surface job details without an extra join.
   */
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true })
  jobId: Types.ObjectId;

  // ── Content ─────────────────────────────────────────────────────────────────

  /**
   * Star rating, an integer in the range 1..5 (Req 1.2).
   */
  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  /**
   * Optional free-text comment, capped at 1,000 characters (Req 1.3, 2.7).
   * Defaults to an empty string when omitted.
   */
  @Prop({ trim: true, maxlength: 1000, default: '' })
  comment: string;

  // ── Moderation ────────────────────────────────────────────────────────────

  /**
   * Moderation flag. Hidden reviews are excluded from public lists and from
   * trust-score aggregation (Req 2.6, 3). Indexed for the visible-list query.
   */
  @Prop({ default: false, index: true })
  hidden: boolean;

  /**
   * Admin (User._id) who last hid or restored this review (Req 3.1, 3.2).
   */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  moderatedBy?: Types.ObjectId;

  /**
   * Reason supplied by the moderating admin, capped at 1,000 characters (Req 3.1).
   */
  @Prop({ trim: true, maxlength: 1000 })
  moderationReason?: string;

  /**
   * Timestamp of the last moderation action (Req 3.1, 3.2).
   */
  @Prop({ type: Date })
  moderatedAt?: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * UNIQUE compound index on (applicationId, direction).
 *
 * Enforces the business rule (Req 1.8, 13.1):
 *   "Each party may leave at most one review per application."
 *
 * Backs the service-layer duplicate check (ERR_4002) atomically under
 * concurrent requests.
 */
ReviewSchema.index({ applicationId: 1, direction: 1 }, { unique: true });

/**
 * List a reviewee's visible reviews newest-first (Req 2.1).
 * Covers the public `GET /reviews?revieweeId=` query, filtering on `hidden`.
 */
ReviewSchema.index({ revieweeId: 1, hidden: 1, createdAt: -1 });
