import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Document type
// ─────────────────────────────────────────────────────────────────────────────

export type PayoutSettingsDocument = HydratedDocument<PayoutSettings>;

/**
 * Stores the user's saved bank account details in the `payout_settings`
 * collection.  A single document exists per user (enforced by unique index).
 *
 * These details are:
 *   1. Validated before a payout request is allowed to proceed.
 *   2. Snapshotted into the Payout.bankInfo field at request creation time
 *      so historical records remain accurate if settings are later changed.
 *
 * The service uses `findOneAndUpdate` with `{ upsert: true }` so no seed
 * step is required — the document is created on the first PUT call.
 */
@Schema({
  timestamps: true,
  collection: 'payout_settings',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class PayoutSettings {
  /** 1-to-1 link to the owning User document. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  /** The name of the bank (e.g. "Vietcombank", "Techcombank"). */
  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  bankName: string;

  /** The user's bank account number (stored as string to preserve leading zeros). */
  @Prop({ type: String, required: true, trim: true, maxlength: 30 })
  accountNumber: string;

  /** The account holder name exactly as it appears on the bank account. */
  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  accountHolderName: string;
}

export const PayoutSettingsSchema = SchemaFactory.createForClass(PayoutSettings);
