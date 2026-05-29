import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Application,
  ApplicationDocument,
  ApplicationStatus,
} from './schemas/application.schema';
import { Job, JobDocument, JobStatus } from '../jobs/schemas/job.schema';
import { CreateApplicationDto } from './dto/create-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,

    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,
  ) {}

  // ─── POST /applications ────────────────────────────────────────────────────

  /**
   * Submit a new application for an active casual job shift.
   *
   * Guards (in order):
   *   1. Duplicate check  — throws ERR_4002 if the candidate already applied.
   *   2. Job existence    — throws ERR_4001 if the job is not found or not ACTIVE.
   *
   * Side effect:
   *   Atomically increments `Job.applicationCount` to keep the analytics
   *   counter in sync without requiring a separate aggregation query.
   */
  async apply(
    userId: string,
    dto: CreateApplicationDto,
  ): Promise<ApplicationDocument> {
    const candidateObjectId = new Types.ObjectId(userId);
    const jobObjectId       = new Types.ObjectId(dto.jobId);

    // ── Guard 1: Duplicate application ────────────────────────────────────────
    const alreadyApplied = await this.applicationModel.exists({
      candidateId: candidateObjectId,
      jobId:       jobObjectId,
    });

    if (alreadyApplied) {
      throw new ConflictException({
        errorCode: 'ERR_4002',
        message:   'You have already submitted an application for this job.',
      });
    }

    // ── Guard 2: Job must exist and be ACTIVE ─────────────────────────────────
    const job = await this.jobModel.findOne({
      _id:    jobObjectId,
      status: JobStatus.ACTIVE,
    });

    if (!job) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Job with ID "${dto.jobId}" was not found or is no longer accepting applications.`,
      });
    }

    // ── Create the application document ───────────────────────────────────────
    const application = await this.applicationModel.create({
      candidateId:  candidateObjectId,
      jobId:        jobObjectId,
      cvType:       dto.cvType,
      cvPdfUrl:     dto.cvPdfUrl,
      coverLetter:  dto.coverLetter,
      status:       ApplicationStatus.APPLIED,
    });

    // ── Increment the denormalised counter on the Job ─────────────────────────
    await this.jobModel.updateOne(
      { _id: jobObjectId },
      { $inc: { applicationCount: 1 } },
    );

    return application;
  }

  // ─── GET /applications/my ──────────────────────────────────────────────────

  /**
   * Returns a paginated, reverse-chronological list of all applications
   * submitted by the calling candidate.
   *
   * Populates a lightweight job snapshot (title, companyName, location, status)
   * so the candidate's history page does not require a second round-trip.
   */
  async findMyApplications(
    userId: string,
    page  = 1,
    limit = 10,
  ) {
    const candidateObjectId = new Types.ObjectId(userId);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.applicationModel
        .find({ candidateId: candidateObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('jobId', 'title companyName companyLogoUrl location status expiresAt')
        .lean(),
      this.applicationModel.countDocuments({ candidateId: candidateObjectId }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── GET /applications/:id ─────────────────────────────────────────────────

  /**
   * Returns the full detail of a single application.
   *
   * Guards:
   *   ERR_4001 — Application not found.
   *   ERR_2001 — Caller is not the application owner.
   */
  async findById(
    id:     string,
    userId: string,
  ): Promise<ApplicationDocument> {
    const application = await this.applicationModel
      .findById(id)
      .populate('jobId', 'title companyName companyLogoUrl location salaryType salaryAmount workingTimeText status expiresAt')
      .lean();

    if (!application) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Application with ID "${id}" was not found.`,
      });
    }

    if (application.candidateId.toString() !== userId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have permission to view this application.',
      });
    }

    return application as ApplicationDocument;
  }

  // ─── GET /applications/:id/status ─────────────────────────────────────────

  /**
   * Returns a lightweight status snapshot for the candidate's tracking view.
   *
   * Response shape: { status, scheduledAt?, employerNote?, updatedAt }
   *
   * Guards: same ownership check as findById.
   */
  async getStatus(id: string, userId: string) {
    const application = await this.applicationModel
      .findById(id)
      .select('candidateId status scheduledAt employerNote updatedAt')
      .lean<ApplicationDocument & { updatedAt: Date }>();

    if (!application) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Application with ID "${id}" was not found.`,
      });
    }

    if (application.candidateId.toString() !== userId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have permission to view this application status.',
      });
    }

    return {
      status:       application.status,
      scheduledAt:  application.scheduledAt,
      employerNote: application.employerNote,
      updatedAt:    application.updatedAt,
    };
  }

  // ─── DELETE /applications/:id ──────────────────────────────────────────────

  /**
   * Withdraws a pending application.
   *
   * Guards:
   *   ERR_4001 — Application not found.
   *   ERR_2001 — Caller is not the application owner.
   *   ERR_2002 — Application has already been reviewed (status ≠ Applied).
   *              Prevents withdrawal after the employer has seen the application.
   *
   * Side effect:
   *   Decrements `Job.applicationCount` to keep the counter accurate.
   */
  async withdraw(id: string, userId: string): Promise<void> {
    const application = await this.applicationModel
      .findById(id)
      .select('candidateId jobId status')
      .lean();

    if (!application) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Application with ID "${id}" was not found.`,
      });
    }

    // ── Ownership guard ───────────────────────────────────────────────────────
    if (application.candidateId.toString() !== userId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have permission to withdraw this application.',
      });
    }

    // ── Status guard: only "Applied" (unseen) applications may be withdrawn ──
    if (application.status !== ApplicationStatus.APPLIED) {
      throw new ForbiddenException({
        errorCode: 'ERR_2002',
        message:
          `This application can no longer be withdrawn because it has already ` +
          `been reviewed (current status: "${application.status}").`,
      });
    }

    // ── Perform withdrawal ────────────────────────────────────────────────────
    await this.applicationModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { status: ApplicationStatus.WITHDRAWN },
    );

    // Decrement the denormalised counter on the Job
    await this.jobModel.updateOne(
      { _id: application.jobId },
      { $inc: { applicationCount: -1 } },
    );
  }

  // ─── GET /applications/:jobId/check ───────────────────────────────────────

  /**
   * Returns whether the calling candidate has already applied to a given job.
   *
   * Consumed by the front-end to toggle the "Apply" button state
   * before the candidate navigates to the full apply form.
   *
   * @param jobId  MongoDB ObjectId string of the target casual job.
   * @param userId The calling candidate's user ID from the JWT payload.
   * @returns      `{ applied: boolean }`
   */
  async checkApplied(jobId: string, userId: string): Promise<{ applied: boolean }> {
    const exists = await this.applicationModel.exists({
      candidateId: new Types.ObjectId(userId),
      jobId:       new Types.ObjectId(jobId),
    });

    return { applied: !!exists };
  }
}
