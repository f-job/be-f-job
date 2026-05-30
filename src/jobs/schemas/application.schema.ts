import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { ApplicationStatus } from './enums/ApplicationStatus';

export type ApplicationDocument = HydratedDocument<Application>;

@Schema({
  timestamps: true,
  collection: 'applications',
})
export class Application extends Document {

  // ─────────────── RELATION ───────────────

  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  jobId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CandidateProfile', required: true, index: true })
  candidateId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EmployerProfile', required: true, index: true })
  employerId: Types.ObjectId;

  // ─────────────── SNAPSHOT DATA ───────────────

  @Prop({ required: true, trim: true })
  candidateName: string;

  @Prop({ trim: true })
  candidatePhone?: string;

  @Prop({ trim: true })
  resumeUrl?: string;

  @Prop({ trim: true })
  coverLetter?: string;

  // ─────────────── STATUS ───────────────

  @Prop({ default: ApplicationStatus.PENDING, index: true })
  status: ApplicationStatus;

  // ─────────────── META ───────────────

  @Prop({ trim: true })
  noteByEmployer?: string; // note khi review

  @Prop({ default: false })
  isViewed: boolean;
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);