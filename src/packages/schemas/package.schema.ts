import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PackageDocument = HydratedDocument<Package>;

@Schema({
  timestamps: true,
  collection: 'packages',
})
export class Package {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, min: 0 })
  price: number; // Cost of package in legal currency (VND)

  @Prop({ required: true, min: 1 })
  credits: number; // Amount of credits granted by this package

  @Prop({ required: true, min: 1, default: 30 })
  durationDays: number; // Expiry duration in days

  @Prop({ default: true })
  isActive: boolean; // Flag to enable/disable package purchasing (allows soft delete)
}

export const PackageSchema = SchemaFactory.createForClass(Package);

// Add index on isActive for high performance public queries
PackageSchema.index({ isActive: 1 });
