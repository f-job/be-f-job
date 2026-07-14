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

@Schema({ _id: false })
export class EmployerBranch {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  address: string;
}

export const EmployerBranchSchema = SchemaFactory.createForClass(EmployerBranch);

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

  // ===== LEGAL INFORMATION =====
  @Prop({ trim: true })
  englishName?: string;

  @Prop({ trim: true })
  shortName?: string;

  @Prop({ trim: true, index: true, sparse: true })
  businessRegistrationNumber?: string;

  @Prop({ trim: true })
  legalRepresentative?: string;

  @Prop({ type: [EmployerBranchSchema], default: [] })
  branches: EmployerBranch[];

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

  // ===== TRUST AGGREGATES (Trust & Safety) =====
  // An employer can be a reviewee; aggregates maintained by TrustScoreService.
  // The verified badge reuses the existing `status`/`verifiedAt` fields above.

  // Persisted Trust Score (0–100).
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  trustScore: number;

  // Mean of visible ratings (1 dp), 0 when there are no visible reviews.
  @Prop({ type: Number, default: 0, min: 0, max: 5 })
  averageRating: number;

  // Count of currently-visible reviews for this reviewee.
  @Prop({ type: Number, default: 0, min: 0 })
  reviewCount: number;

  // True while there are fewer than 3 visible reviews.
  @Prop({ default: true })
  provisional: boolean;
}

export const EmployerProfileSchema =
  SchemaFactory.createForClass(EmployerProfile);
