import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export enum PayoutStatus {
  /** Request submitted, awaiting admin review. */
  PENDING    = 'pending',
  /** Admin has started processing the bank transfer. */
  PROCESSING = 'processing',
  /** Bank transfer completed and confirmed. */
  COMPLETED  = 'completed',
  /** Request was declined by admin. */
  REJECTED   = 'rejected',
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedded sub-document: BankInfo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot of the bank account details at request time.
 * Stored inline so historical records remain accurate even if
 * the user later updates their bank settings.
 */
export class BankInfoSnapshot {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document type
// ─────────────────────────────────────────────────────────────────────────────

export type PayoutDocument = HydratedDocument<Payout>;

/**
 * Represents a single withdrawal/payout request in the `payouts` collection.
 *
 * Lifecycle:  pending → processing → completed | rejected
 *
 * The `bankInfo` embedded document is a snapshot captured at request creation
 * time so that admin can see the exact bank details the user intended, even
 * if they change their PayoutSettings later.
 *
 * Indexes:
 *   - { userId, createdAt: -1 } — paginated history for a user.
 *   - { status }                — admin dashboard filtering by status (future use).
 */
@Schema({
  timestamps: true,
  collection: 'payouts',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Payout {
  /** Owner of this payout request. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  /** Requested withdrawal amount in VND. Must be ≥ MIN_PAYOUT_AMOUNT. */
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  /**
   * Snapshot of bank account details at the time of request creation.
   * Stored as a plain sub-object (not a referenced document) for immutability.
   */
  @Prop({
    type: {
      bankName:          { type: String, required: true },
      accountNumber:     { type: String, required: true },
      accountHolderName: { type: String, required: true },
    },
    required: true,
    _id:      false,
  })
  bankInfo: BankInfoSnapshot;

  /** Current processing state of the payout request. */
  @Prop({ type: String, enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  /**
   * External bank transaction reference ID.
   * Filled by admin/back-office when the transfer is marked completed.
   */
  @Prop({ type: String, trim: true, default: null })
  transactionId?: string | null;

  /**
   * Free-text note from the admin — typically used to explain a rejection.
   * Also visible to the user in GET /payouts/my/:id.
   */
  @Prop({ type: String, trim: true, maxlength: 500, default: null })
  adminNote?: string | null;

  /**
   * Timestamp when the payout moved to completed or rejected state.
   * Null while still pending or processing.
   */
  @Prop({ type: Date, default: null })
  processedAt?: Date | null;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Paginated history list for a user, sorted newest-first.
PayoutSchema.index({ userId: 1, createdAt: -1 });

// Admin status-based filtering (future admin panel).
PayoutSchema.index({ status: 1 });
