import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmployerCreditDocument = HydratedDocument<EmployerCredit>;

@Schema({ _id: false })
export class PurchasedPackage {
  @Prop({ type: Types.ObjectId, ref: 'Package', required: true })
  packageId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: Date.now })
  purchasedAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PurchasedPackageSchema = SchemaFactory.createForClass(PurchasedPackage);

@Schema({
  timestamps: true,
  collection: 'employer_credits',
})
export class EmployerCredit {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EmployerProfile', required: true })
  employerId: Types.ObjectId;

  @Prop({ required: true, default: 0, min: 0 })
  balance: number;

  @Prop({ type: [PurchasedPackageSchema], default: [] })
  purchasedPackages: PurchasedPackage[];
}

export const EmployerCreditSchema = SchemaFactory.createForClass(EmployerCredit);

// Enforce unique indexes at the schema level for high-integrity partitioning
EmployerCreditSchema.index({ userId: 1 }, { unique: true });
EmployerCreditSchema.index({ employerId: 1 }, { unique: true });
