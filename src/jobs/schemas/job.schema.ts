import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type JobDocument = HydratedDocument<Job>;

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum JobStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  ACTIVE = 'active',
  CLOSED = 'closed',
  EXPIRED = 'expired',
}

export enum JobLevel {
  INTERN = 'Intern',
  FRESHER = 'Fresher',
  JUNIOR = 'Junior',
  SENIOR = 'Senior',
  MANAGER = 'Manager',
}

export enum JobType {
  ONSITE = 'Onsite',
  HYBRID = 'Hybrid',
  REMOTE = 'Remote',
}

// ─── Schema ───────────────────────────────────────────────────────────────────

@Schema({
  timestamps: true,
  collection: 'jobs',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Job extends Document {
  /** Reference to the Employer who posted the job */
  @Prop({ type: Types.ObjectId, ref: 'EmployerProfile', required: true, index: true })
  employerId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  companyName: string;

  @Prop({ trim: true })
  companyLogoUrl?: string;

  /** Province / City */
  @Prop({ required: true, trim: true, maxlength: 100 })
  location: string;

  /** District within the city */
  @Prop({ trim: true, maxlength: 100 })
  district?: string;

  /** Minimum monthly salary (VND). 0 = negotiable */
  @Prop({ default: 0, min: 0 })
  salaryMin: number;

  /** Maximum monthly salary (VND). 0 = negotiable */
  @Prop({ default: 0, min: 0 })
  salaryMax: number;

  @Prop({ required: true, enum: JobLevel })
  level: JobLevel;

  @Prop({ required: true, enum: JobType })
  jobType: JobType;

  /** Industry / field e.g. "IT", "Bán hàng", "Marketing" */
  @Prop({ required: true, trim: true, maxlength: 100, index: true })
  industry: string;

  /** Number of open positions */
  @Prop({ default: 1, min: 1 })
  slots: number;

  /** Application deadline */
  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: JobStatus.PENDING, enum: JobStatus, index: true })
  status: JobStatus;

  /** Urgent / hot flag — surfaces the job in /jobs/urgent */
  @Prop({ default: false, index: true })
  isUrgent: boolean;

  /** Admin pinned / VIP flag */
  @Prop({ default: false })
  isPinned: boolean;

  /** Required skills list */
  @Prop({ type: [String], default: [] })
  skills: string[];

  /** Admin rejection reason (if status becomes rejected) */
  @Prop({ trim: true })
  rejectionReason?: string;

  /** Total application count — denormalised counter, updated on each apply */
  @Prop({ default: 0, min: 0 })
  applicationCount: number;

  /** View count */
  @Prop({ default: 0, min: 0 })
  viewCount: number;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// ─── Compound Indexes for common filter patterns ───────────────────────────────
JobSchema.index({ status: 1, industry: 1 });
JobSchema.index({ status: 1, location: 1 });
JobSchema.index({ status: 1, isUrgent: 1 });
JobSchema.index({ status: 1, createdAt: -1 });
JobSchema.index({ status: 1, salaryMax: -1 });
JobSchema.index({ title: 'text', description: 'text', companyName: 'text' });
