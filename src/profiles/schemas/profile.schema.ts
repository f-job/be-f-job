import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

// ─── Experience Item Schema ────────────────────────────────────────────────
@Schema({ _id: true, timestamps: true })
export class ExperienceItem extends Document {
  @Prop({ required: true, trim: true })
  role: string;

  @Prop({ required: true, trim: true })
  location: string;

  @Prop({ required: true, trim: true })
  duration: string;

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
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);

// Indexing for quick lookups
ProfileSchema.index({ userId: 1 });
ProfileSchema.index({ 'files._id': 1 });
