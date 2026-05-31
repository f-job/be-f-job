import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

// ─── Verification Status (Trust & Safety) ───────────────────────────────────
export enum VerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

// ─── Experience Item Schema ────────────────────────────────────────────────
@Schema({ _id: true, timestamps: true })
export class ExperienceItem extends Document {
  @Prop({ required: true, trim: true })
  role: string;

  @Prop({ required: true, trim: true })
  companyName: string;

  @Prop({ required: true, trim: true })
  startDate: string;

  @Prop({ trim: true })
  endDate?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  duration?: string;

  @Prop({ trim: true })
  description?: string;
}
export const ExperienceItemSchema = SchemaFactory.createForClass(ExperienceItem);

// ─── Education Item Schema ──────────────────────────────────────────────────
@Schema({ _id: true, timestamps: true })
export class EducationItem extends Document {
  @Prop({ required: true, trim: true })
  school: string;

  @Prop({ trim: true })
  major?: string;

  @Prop({ required: true, trim: true })
  duration: string;

  @Prop({ trim: true })
  degree?: string;
}
export const EducationItemSchema = SchemaFactory.createForClass(EducationItem);

// ─── Skill Item Schema ──────────────────────────────────────────────────────
@Schema({ _id: true, timestamps: true })
export class SkillItem extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;
}
export const SkillItemSchema = SchemaFactory.createForClass(SkillItem);

// ─── CV File Schema ─────────────────────────────────────────────────────────
@Schema({ _id: true, timestamps: true })
export class CvFile extends Document {
  @Prop({ required: true, trim: true })
  fileName: string;

  @Prop({ required: true, trim: true })
  fileUrl: string;

  @Prop({ required: true, trim: true })
  filePath: string;

  @Prop({ required: true })
  fileSize: number;

  @Prop({ default: false })
  isPrimary: boolean;
}
export const CvFileSchema = SchemaFactory.createForClass(CvFile);

// ─── Identity Document Schema (Trust & Safety) ──────────────────────────────
@Schema({ _id: true, timestamps: true })
export class IdentityDocument extends Document {
  @Prop({ required: true, trim: true })
  fileUrl: string;

  @Prop({ required: true, trim: true })
  fileName: string;

  @Prop({ required: true, trim: true })
  mimeType: string; // image/jpeg | image/png | application/pdf

  @Prop({ required: true, min: 0 })
  fileSize: number; // bytes, ≤ 10MB enforced in DTO
}
export const IdentityDocumentSchema =
  SchemaFactory.createForClass(IdentityDocument);

// ─── Main Profile Schema ────────────────────────────────────────────────────
export type ProfileDocument = HydratedDocument<Profile>;

@Schema({
  timestamps: true,
  collection: 'candidate_profiles',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Profile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  summary?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  district?: string;

  @Prop({ default: false })
  openToWork: boolean;

  @Prop({ trim: true })
  avatarUrl?: string;

  @Prop({ type: [ExperienceItemSchema], default: [] })
  experiences: Types.DocumentArray<ExperienceItem>;

  @Prop({ type: [EducationItemSchema], default: [] })
  educations: Types.DocumentArray<EducationItem>;

  @Prop({ type: [SkillItemSchema], default: [] })
  skills: Types.DocumentArray<SkillItem>;

  @Prop({ type: [CvFileSchema], default: [] })
  files: Types.DocumentArray<CvFile>;

  // ─── Trust aggregates (Trust & Safety) ──────────────────────────────────────
  // Persisted Trust Score (0–100), maintained by TrustScoreService.recalculate.
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

  // Accumulated no-show transitions (penalty basis for the trust score).
  @Prop({ type: Number, default: 0, min: 0 })
  noShowCount: number;

  // ─── Identity Verification (Trust & Safety) ─────────────────────────────────
  // Candidate identity verification state, maintained by VerificationService.
  @Prop({
    type: String,
    enum: VerificationStatus,
    default: VerificationStatus.UNVERIFIED,
  })
  verificationStatus: VerificationStatus;

  // Uploaded identity documents (CCCD / student card), 1–5 per submission.
  @Prop({ type: [IdentityDocumentSchema], default: [] })
  identityDocuments: Types.DocumentArray<IdentityDocument>;

  // Time the candidate entered PENDING_REVIEW (drives queue ordering).
  @Prop({ type: Date })
  verificationSubmittedAt?: Date;

  // Approval timestamp.
  @Prop({ type: Date })
  verifiedAt?: Date;

  // Approving admin.
  @Prop({ type: Types.ObjectId, ref: 'User' })
  verifiedBy?: Types.ObjectId;

  // Rejection reason recorded by the reviewing admin.
  @Prop({ trim: true })
  verificationRejectedReason?: string;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);

// Indexing for quick lookups
ProfileSchema.index({ userId: 1 });
ProfileSchema.index({ 'files._id': 1 });
// Verification queue: PENDING_REVIEW candidates ordered oldest-first (Req 8.1).
ProfileSchema.index({ verificationStatus: 1, verificationSubmittedAt: 1 });
