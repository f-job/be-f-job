import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type CandidateProfileDocument = HydratedDocument<CandidateProfile>;

@Schema({
  timestamps: true,
  collection: 'candidate_profiles',
})
export class CandidateProfile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  resumeUrl?: string;

  @Prop({ default: false })
  openToWork: boolean;

  @Prop({ trim: true })
  avatarUrl?: string;
}

export const CandidateProfileSchema = SchemaFactory.createForClass(CandidateProfile);
