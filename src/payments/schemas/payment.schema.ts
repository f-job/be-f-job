import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

@Schema({
  timestamps: true,
  collection: 'payments',
})
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Package', required: true })
  packageId: Types.ObjectId;

  // Globally unique code to identify the transfer, e.g., PAY_X82AB91
  @Prop({ required: true, unique: true, trim: true })
  paymentCode: string;

  // Snapshots at time of creation to ensure immutability
  @Prop({ required: true, trim: true })
  packageName: string;

  @Prop({ required: true, min: 1 })
  creditsSnapshot: number;

  @Prop({ required: true, min: 0 })
  amountSnapshot: number;

  @Prop({ required: true, type: String, enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  // The external transaction ID from the webhook/bank if available
  @Prop({ trim: true })
  transactionId?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  paidAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Indexes for fast lookups
PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ paymentCode: 1 }, { unique: true });
PaymentSchema.index({ status: 1 });
