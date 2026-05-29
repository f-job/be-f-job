import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type JobDocument = HydratedDocument<Job>;

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a casual job posting.
 * Mirrors the platform's admin moderation workflow.
 */
export enum JobStatus {
  DRAFT    = 'draft',
  PENDING  = 'pending',
  ACTIVE   = 'active',
  CLOSED   = 'closed',
  EXPIRED  = 'expired',
}

/**
 * Experience requirement tailored for casual / short-term workers.
 * Replaces the old corporate JobLevel (Intern → Manager) which is
 * irrelevant in the F-Job casual marketplace context.
 */
export enum ExperienceLevel {
  NONE           = 'No Experience',
  UNDER_6_MONTHS = '< 6 Months',
  ABOVE_6_MONTHS = '> 6 Months',
}

/**
 * Type of casual engagement.
 * Replaces the old work-arrangement JobType (Onsite / Hybrid / Remote)
 * which applies to corporate roles, not casual shifts or event work.
 */
export enum CasualJobType {
  PART_TIME = 'Part-time',
  GIG_EVENT = 'Event',
  SEASONAL  = 'Seasonal',
}

/**
 * How the casual wage is denominated.
 * Hourly: paid per working hour (e.g. 25,000 VND/hr).
 * Daily:  paid per shift/day   (e.g. 300,000 VND/day).
 * Fixed:  flat fee per gig     (e.g. 500,000 VND/event).
 */
export enum SalaryType {
  HOURLY = 'hourly',
  DAILY  = 'daily',
  FIXED  = 'fixed',
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
  // ── Identity ────────────────────────────────────────────────────────────────

  /** Reference to the Employer / business owner who posted the gig */
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

  // ── Location ─────────────────────────────────────────────────────────────────

  /** Province / City (e.g. "Hồ Chí Minh", "Hà Nội") */
  @Prop({ required: true, trim: true, maxlength: 100 })
  location: string;

  /** District / Ward within the city (e.g. "Quận 1", "Cầu Giấy") */
  @Prop({ trim: true, maxlength: 100 })
  district?: string;

  // ── Casual Wage ──────────────────────────────────────────────────────────────

  /**
   * How the casual wage is denominated: hourly | daily | fixed.
   * Paired with `salaryAmount` to form the complete compensation description.
   * Example: salaryType = "hourly", salaryAmount = 25000 → 25,000 VND/hr.
   */
  @Prop({ required: true, enum: SalaryType })
  salaryType: SalaryType;

  /**
   * The actual casual wage figure in VND, interpreted in the unit of `salaryType`.
   * Using a flat scalar (not a min/max range) is correct for casual gigs where
   * the rate is fixed, not negotiated on a corporate band.
   */
  @Prop({ required: true, min: 0 })
  salaryAmount: number;

  // ── Job Classification ───────────────────────────────────────────────────────

  /**
   * Experience requirement for this casual role.
   * Values: "No Experience" | "< 6 Months" | "> 6 Months".
   */
  @Prop({ required: true, enum: ExperienceLevel })
  level: ExperienceLevel;

  /**
   * Type of casual engagement.
   * Values: "Part-time" | "Event" | "Seasonal".
   */
  @Prop({ required: true, enum: CasualJobType })
  jobType: CasualJobType;

  /** Industry / sector (e.g. "F&B", "Bán lẻ", "Sự kiện", "Giao hàng") */
  @Prop({ required: true, trim: true, maxlength: 100, index: true })
  industry: string;

  // ── Shift / Schedule ─────────────────────────────────────────────────────────

  /**
   * Human-readable shift description (critical for casual jobs).
   * Examples: "Ca A: 08:00 – 13:00", "Ca tối: 18:00 – 23:00",
   *           "Cả ngày: 07:00 – 19:00 (thứ 7, CN)".
   */
  @Prop({ required: true, trim: true, maxlength: 300 })
  workingTimeText: string;

  /** Number of open headcount / slots for this gig */
  @Prop({ default: 1, min: 1 })
  slots: number;

  /** Date the gig expires / closes for applications */
  @Prop({ type: Date })
  expiresAt?: Date;

  // ── Benefits ─────────────────────────────────────────────────────────────────

  /**
   * Perks and benefits specific to casual workers.
   * Examples: ["Bao cơm", "Tips", "Phụ cấp đi lại", "Thưởng hoàn thành ca"].
   * Replaces the old `skills` array which belonged to corporate job descriptions.
   */
  @Prop({ type: [String], default: [] })
  benefits: string[];

  // ── Moderation & Visibility ──────────────────────────────────────────────────

  @Prop({ default: JobStatus.PENDING, enum: JobStatus, index: true })
  status: JobStatus;

  /** Urgent / hot flag — surfaces the gig in /jobs/urgent */
  @Prop({ default: false, index: true })
  isUrgent: boolean;

  /** Admin pinned / VIP / promoted flag */
  @Prop({ default: false })
  isPinned: boolean;

  /** Reason recorded by Admin when a job posting is rejected */
  @Prop({ trim: true })
  rejectionReason?: string;

  // ── Analytics ────────────────────────────────────────────────────────────────

  /** Denormalised application counter; incremented on each apply event */
  @Prop({ default: 0, min: 0 })
  applicationCount: number;

  /** View counter; atomically incremented on each GET /jobs/:id call */
  @Prop({ default: 0, min: 0 })
  viewCount: number;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// ─── Compound Indexes for common filter patterns ───────────────────────────────

// Most common: browsing active jobs in a specific city
JobSchema.index({ status: 1, location: 1 });

// Browsing active jobs within a specific industry (e.g. "F&B", "Sự kiện")
JobSchema.index({ status: 1, industry: 1 });

// Urgent gig feed
JobSchema.index({ status: 1, isUrgent: 1 });

// Default "newest" listing sort
JobSchema.index({ status: 1, createdAt: -1 });

// Salary high/low sort — now on the flat salaryAmount field
JobSchema.index({ status: 1, salaryAmount: -1 });

// Full-text search across title, description, and company name
JobSchema.index({ title: 'text', description: 'text', companyName: 'text' });
