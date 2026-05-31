import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type ApplicationDocument = HydratedDocument<Application>;

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * Lifecycle state of a candidate's application in the F-Job marketplace.
 *
 * Flow (happy path):
 *   Applied → Viewed → Scheduled → Accepted → Completed
 *
 * Terminal states:
 *   Rejected  — employer declined the candidate.
 *   Withdrawn — candidate voluntarily withdrew before employer review.
 *   Completed — candidate worked the shift; engagement finished successfully.
 *   NoShow    — candidate did not appear for an accepted shift (ghosting).
 */
export enum ApplicationStatus {
  APPLIED    = 'Applied',
  VIEWED     = 'Viewed',
  SCHEDULED  = 'Scheduled',
  ACCEPTED   = 'Accepted',
  REJECTED   = 'Rejected',
  WITHDRAWN  = 'Withdrawn',
  COMPLETED  = 'Completed',
  NO_SHOW    = 'NoShow',
}

/**
 * How the candidate is submitting their CV profile for this casual job.
 * Casual marketplace supports three lightweight modes rather than
 * the formal "upload a full resume" flow.
 */
export enum CvType {
  ONLINE = 'online',   // Candidate's pre-built online profile / digital CV
  PDF    = 'pdf',      // Uploaded PDF file (cvPdfUrl is required)
  QUICK  = 'quick',   // Quick-apply: minimal profile snapshot, no CV needed
}

// ─── Schema ───────────────────────────────────────────────────────────────────

@Schema({
  timestamps: true,
  collection: 'applications',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Application extends Document {
  // ── Participants ─────────────────────────────────────────────────────────────

  /**
   * The candidate who submitted this application.
   * References the `users` collection (User._id).
   * Indexed individually for the GET /applications/my query.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  candidateId: Types.ObjectId;

  /**
   * The casual job this application targets.
   * References the `jobs` collection (Job._id).
   * Indexed for employer-side ATS queries (GET /employers/jobs/:id/applications).
   */
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  jobId: Types.ObjectId;

  // ── CV Submission ─────────────────────────────────────────────────────────

  /**
   * Which CV submission mode the candidate chose.
   * 'online'  → their pre-built profile is attached.
   * 'pdf'     → a PDF file URL is stored in cvPdfUrl.
   * 'quick'   → quick-apply with minimal information.
   */
  @Prop({ required: true, enum: CvType })
  cvType: CvType;

  /**
   * URL to the uploaded PDF CV.
   * Only populated when cvType = 'pdf'.
   */
  @Prop({ trim: true })
  cvPdfUrl?: string;

  /**
   * Optional motivation / cover letter text from the candidate.
   * Max 2,000 characters to keep messages concise for casual roles.
   */
  @Prop({ trim: true, maxlength: 2000 })
  coverLetter?: string;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Current step in the application pipeline.
   * Default: 'Applied' (freshly submitted, not yet reviewed by employer).
   */
  @Prop({ default: ApplicationStatus.APPLIED, enum: ApplicationStatus, index: true })
  status: ApplicationStatus;

  /**
   * Employer-side note / rejection reason captured when the status
   * transitions to 'Rejected'. Surfaced to the candidate in status tracking.
   */
  @Prop({ trim: true })
  employerNote?: string;

  /**
   * Interview / shift scheduled timestamp.
   * Populated by the employer when status transitions to 'Scheduled'.
   */
  @Prop({ type: Date })
  scheduledAt?: Date;

  /**
   * Timestamp recorded when the employer marks the application as 'Completed'.
   * Populated on the Accepted → Completed transition.
   */
  @Prop({ type: Date })
  completedAt?: Date;

  /**
   * The employer who marked this application as 'Completed'.
   * References the `employerProfiles` collection (EmployerProfile._id),
   * mirroring Job.employerId — not User._id.
   */
  @Prop({ type: Types.ObjectId, ref: 'EmployerProfile' })
  completedBy?: Types.ObjectId;

  /**
   * Timestamp recorded when the employer marks the application as 'NoShow'.
   * Populated on the Accepted → NoShow transition.
   */
  @Prop({ type: Date })
  noShowAt?: Date;

  /**
   * The employer who reported this application as a 'NoShow'.
   * References the `employerProfiles` collection (EmployerProfile._id),
   * mirroring Job.employerId — not User._id.
   */
  @Prop({ type: Types.ObjectId, ref: 'EmployerProfile' })
  noShowReportedBy?: Types.ObjectId;
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * UNIQUE compound index on (candidateId, jobId).
 *
 * This is the primary database-level guard enforcing the business rule:
 *   "A candidate may only submit ONE application per job."
 *
 * Complements the service-layer duplicate check (ERR_4002) to ensure
 * atomicity even under concurrent requests.
 */
ApplicationSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });

// Employer-side ATS: list all applications for a given job, newest first
ApplicationSchema.index({ jobId: 1, status: 1, createdAt: -1 });

// Candidate-side history: list own applications ordered by most recent
ApplicationSchema.index({ candidateId: 1, createdAt: -1 });
