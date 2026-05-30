import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  Application,
  ApplicationDocument,
  ApplicationStatus,
} from './schemas/application.schema';
import { Job, JobDocument, JobStatus } from '../jobs/schemas/job.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateApplicationDto } from './dto/create-application.dto';
import {
  ApplicationCreatedEvent,
  ApplicationStatusUpdatedEvent,
} from '../notifications/events/application.events';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,

    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  // ─── POST /applications ────────────────────────────────────────────────────

  /**
   * Submit a new application for an active casual job shift.
   *
   * Guards (in order):
   *   1. Duplicate check  — throws ERR_4002 if the candidate already applied.
   *   2. Job existence    — throws ERR_4001 if the job is not found or not ACTIVE.
   *
   * Side effects:
   *   - Atomically increments `Job.applicationCount`.
   *   - Emits `application.created` domain event (picked up by NotificationListener).
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

    // ── Resolve candidate display name for the notification email ─────────────
    const candidateUser = await this.userModel
      .findById(candidateObjectId)
      .select('fullName email')
      .lean<UserDocument>();

    const candidateFullName = candidateUser?.fullName ?? 'Ứng viên';

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

    // ── Resolve employer's User ID from the Job's employerId (EmployerProfile ref) ─
    // job.employerId references EmployerProfile._id in some schemas, but the
    // Job schema stores employerId as ref to 'EmployerProfile'.  We need the
    // underlying User.  Look up the EmployerProfile to find userId.
    // NOTE: If your Job schema uses a direct userId reference, adjust accordingly.
    // We do a lean lookup from users where the employer profile userId matches.
    // For decoupling, we emit with the employerId stored on the job and let the
    // listener resolve — but we need the USER id, not the profile id.
    // Since Job.employerId refs EmployerProfile, and EmployerProfile has userId,
    // we populate in one step:
    const jobWithEmployer = await this.jobModel
      .findById(jobObjectId)
      .select('employerId')
      .populate<{ employerId: { userId: Types.ObjectId } }>('employerId', 'userId')
      .lean();

    const employerUserId: string =
      jobWithEmployer?.employerId?.userId?.toString() ?? '';

    // ── Emit domain event (fully decoupled — listener handles notifications) ──
    if (employerUserId) {
      const event = new ApplicationCreatedEvent();
      event.applicationId    = (application as any)._id.toString();
      event.candidateId      = userId;
      event.candidateFullName = candidateFullName;
      event.jobId            = dto.jobId;
      event.jobTitle         = job.title;
      event.companyName      = job.companyName;
      event.employerUserId   = employerUserId;

      this.eventEmitter.emit('application.created', event);
    }

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

  // ─── Status transition: updateStatus (internal — called by employer routes) ──

  /**
   * Transitions an application to a new lifecycle status.
   * Called by employer-side routes (accept, reject, schedule).
   *
   * Emits `application.status_updated` domain event so NotificationListener
   * can persist the in-app notification and dispatch an email to the candidate.
   *
   * Guards:
   *   ERR_4001 — Application not found.
   *   ERR_2001 — Employer does not own the job this application targets.
   *
   * @param id          Application MongoDB ObjectId string.
   * @param employerId  Employer profile ObjectId (used for ownership validation).
   * @param newStatus   Target ApplicationStatus enum value.
   * @param employerNote  Optional note / rejection reason from the employer.
   */
  async updateStatus(
    id:           string,
    employerId:   string,
    newStatus:    ApplicationStatus,
    employerNote?: string,
  ): Promise<ApplicationDocument> {
    // ── Load application + populate job for context ───────────────────────────
    const application = await this.applicationModel
      .findById(id)
      .populate<{ jobId: JobDocument }>('jobId', 'title companyName employerId')
      .lean();

    if (!application) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Application with ID "${id}" was not found.`,
      });
    }

    // ── Employer ownership guard ──────────────────────────────────────────────
    const populatedJob = application.jobId as unknown as JobDocument;
    if (populatedJob.employerId?.toString() !== employerId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have permission to update this application.',
      });
    }

    // ── Persist the status change ─────────────────────────────────────────────
    const updateFields: Record<string, any> = { status: newStatus };
    if (employerNote !== undefined) {
      updateFields.employerNote = employerNote;
    }

    await this.applicationModel.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: updateFields },
    );

    // ── Emit domain event for NotificationListener ────────────────────────────
    const frontendUrl   = this.configService.get<string>('app.frontendUrl') ?? 'http://localhost:3000';
    const applicationUrl = `${frontendUrl}/applications/${id}`;

    const event = new ApplicationStatusUpdatedEvent();
    event.applicationId  = id;
    event.candidateUserId = application.candidateId.toString();
    event.newStatus       = newStatus;
    event.employerNote    = employerNote;
    event.jobTitle        = populatedJob.title;
    event.companyName     = populatedJob.companyName;
    event.applicationUrl  = applicationUrl;

    this.eventEmitter.emit('application.status_updated', event);

    // Return the updated document
    return this.applicationModel.findById(id).lean() as unknown as ApplicationDocument;
  }
}
