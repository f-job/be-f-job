import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmployerProfileDocument =
  HydratedDocument<EmployerProfile>;

export enum EmployerStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  BLOCKED = 'BLOCKED',
}

@Schema({
  timestamps: true,
  collection: 'employer_profiles',
})
export class EmployerProfile {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  })
  userId: Types.ObjectId;

  // ===== BASIC =====
  @Prop({ required: true, trim: true })
  companyName: string;

  @Prop({ trim: true })
  companyDescription?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  industry?: string;

  @Prop({ trim: true })
  companySize?: string;

  @Prop({ trim: true })
  address?: string;

  // ===== MEDIA =====
  @Prop()
  logoUrl?: string;

  @Prop()
  bannerUrl?: string;

  @Prop({ type: [String], default: [] })
  galleryImages: string[];

  // ===== CONTACT =====
  @Prop({ trim: true })
  contactEmail?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  // ===== LOCATION =====
  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  country?: string;

  // ===== VERIFY =====
  @Prop({
    default: EmployerStatus.PENDING_APPROVAL,
    enum: EmployerStatus,
  })
  status: EmployerStatus;

  @Prop()
  verifiedAt?: Date;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
  })
  verifiedBy?: Types.ObjectId;

  @Prop()
  rejectedReason?: string;

  // ===== BLOCK =====
  @Prop()
  blockedAt?: Date;

  @Prop()
  blockedReason?: string;

  @Prop({ default: 0, min: 0 })
  credit: number;
}

export const EmployerProfileSchema =
  SchemaFactory.createForClass(EmployerProfile);