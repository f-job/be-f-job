import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Enum
// ─────────────────────────────────────────────────────────────────────────────

export enum ReferralStatus {
  /** Reward has been credited to the referrer's wallet. */
  CREDITED = 'credited',
  /** Referral registered but reward not yet confirmed (reserved for future use). */
  PENDING  = 'pending',
  /** Reward was reversed, e.g. if the referee was banned. */
  REVERSED = 'reversed',
}

// ─────────────────────────────────────────────────────────────────────────────
// Document type
// ─────────────────────────────────────────────────────────────────────────────

export type ReferralDocument = HydratedDocument<Referral>;

/**
 * Tracks a single referral event in the `referrals` collection.
 *
 * Constraints:
 *   - One document per (referrerId, refereeId) pair, enforced by the
 *     unique sparse index on `refereeId`.  A user can only be referred once.
 *   - `rewardAmount` is stored in VND and reflects the amount that was
 *     actually credited to the referrer's `referralBalance` at the time.
 *
 * Indexes:
 *   - { referrerId, createdAt: -1 } — paginated history queries for a referrer.
 *   - { refereeId }  (unique)       — prevents double-referral of the same user.
 */
@Schema({
  timestamps: true,
  collection: 'referrals',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Referral {
  /** The user who shared their referral code (the inviter). */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  referrerId: Types.ObjectId;

  /** The user who applied the code (the invitee / new user). */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  refereeId: Types.ObjectId;

  /**
   * Amount credited to referrerId's wallet for this referral (in VND).
   * Snapshotted at the time of the event in case the global reward rate changes.
   */
  @Prop({ type: Number, required: true, min: 0 })
  rewardAmount: number;

  /** Lifecycle state of this referral record. */
  @Prop({ type: String, enum: ReferralStatus, default: ReferralStatus.CREDITED })
  status: ReferralStatus;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Paginated history list for a specific referrer, sorted newest-first.
ReferralSchema.index({ referrerId: 1, createdAt: -1 });

// Enforce one referral per referee (a user cannot be referred twice).
ReferralSchema.index({ refereeId: 1 }, { unique: true });
