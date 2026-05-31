import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CreditTransactionDocument = HydratedDocument<CreditTransaction>;

export enum CreditTransactionType {
  PURCHASE = 'PURCHASE',
  JOB_BOOST = 'JOB_BOOST',
  PROFILE_UNLOCK = 'PROFILE_UNLOCK',
  REFUND = 'REFUND',
  ADMIN_ADJUST = 'ADMIN_ADJUST',
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false }, // Immutable ledger, no updates allowed
  collection: 'credit_transactions',
})
export class CreditTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: CreditTransactionType })
  type: CreditTransactionType;

  @Prop({ required: true })
  amount: number; // Positive for additions, negative for deductions

  @Prop({ required: true, min: 0 })
  balanceAfter: number; // Running balance after this transaction is executed

  @Prop({ type: Types.ObjectId, ref: 'Package' })
  packageId?: Types.ObjectId; // Optional ref if type is PURCHASE

  @Prop({ trim: true })
  packageName?: string; // Cached package name if PURCHASE

  @Prop({ min: 0 })
  price?: number; // Cost of package in legal currency if PURCHASE

  @Prop({ type: Types.ObjectId })
  referenceId?: Types.ObjectId; // E.g. Job ID for JOB_BOOST, Candidate Profile ID for PROFILE_UNLOCK

  @Prop({ required: true, trim: true })
  description: string; // Description of the transactional event
}

export const CreditTransactionSchema = SchemaFactory.createForClass(CreditTransaction);

// Compound index for reverse-chronological paginated querying of audit ledger per user
CreditTransactionSchema.index({ userId: 1, createdAt: -1 });
// Regular index on type for global admin monitoring aggregations
CreditTransactionSchema.index({ type: 1 });
