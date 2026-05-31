import {
  BadRequestException,
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
import {
  EmployerProfile,
  EmployerProfileDocument,
} from '../employers/schemas/employer-profile.schema';
import { CreateApplicationDto } from './dto/create-application.dto';
import {
  ApplicationCreatedEvent,
  ApplicationStatusUpdatedEvent,
  ApplicationCompletedEvent,
  ApplicationNoShowEvent,
} from '../notifications/events/application.events';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditTargetType,
} from '../audit/schemas/audit-log.schema';
import { TrustScoreService } from '../reviews/trust-score.service';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,

    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(EmployerProfile.name)
    private readonly employerProfileModel: Model<EmployerProfileDocument>,

    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly trustScoreService: TrustScoreService,
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

  // ─── PUT /employers/applications/:id/complete ──────────────────────────────

  /**
   * Marks an Accepted application as Completed (Accepted → Completed).
   *
   * Only the Employer that owns the Job referenced by the application may
   * perform this transition. `Completed` is a terminal status: the transition
   * is permitted exactly once and only from `Accepted` (Req 5.1, 5.2, 5.6,
   * 13.4, 13.6).
   *
   * Ownership note: `Job.employerId` references `EmployerProfile._id`, NOT
   * `User._id`. The caller passes their own `User._id` (`employerUserId`); we
   * resolve their `EmployerProfile` and assert its `_id` equals the job's
   * `employerId` (Req 5.3, 12.4).
   *
   * Guards (in order):
   *   ERR_4001 — Application not found.
   *   ERR_2001 — Caller is not the employer that owns the referenced job.
   *   ERR_2002 — Application is not in `Accepted` (atomic guard matched zero
   *              docs — already terminal / wrong state) (Req 5.2, 13.4, 13.6).
   *
   * Side effects (on success):
   *   - Sets `status = Completed`, `completedAt = now`, `completedBy = employerProfile._id`.
   *   - Appends an `AuditLog` entry (`APPLICATION_COMPLETED`) (Req 15.2).
   *   - Emits `application.completed` so both parties are notified that reviews
   *     may now be submitted (Req 5.5).
   *
   * @param applicationId  Application MongoDB ObjectId string.
   * @param employerUserId The calling employer's User._id (from the JWT).
   */
  async markCompleted(
    applicationId: string,
    employerUserId: string,
  ): Promise<ApplicationDocument> {
    // ── Load application + populate the job's employerId for ownership ────────
    const application = await this.applicationModel
      .findById(applicationId)
      .populate<{ jobId: JobDocument }>('jobId', 'title companyName employerId')
      .lean();

    if (!application) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Application with ID "${applicationId}" was not found.`,
      });
    }

    const populatedJob = application.jobId as unknown as JobDocument;

    // ── Resolve the caller's EmployerProfile and assert ownership ─────────────
    // Job.employerId refs EmployerProfile._id (not User._id), so we resolve the
    // caller's profile from their userId and compare profile._id to the job's
    // employerId (Req 5.3, 12.4).
    const employerProfile = await this.employerProfileModel
      .findOne({ userId: new Types.ObjectId(employerUserId) })
      .select('_id')
      .lean();

    const ownsJob =
      !!employerProfile &&
      populatedJob.employerId?.toString() === employerProfile._id.toString();

    if (!ownsJob) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have permission to complete this application.',
      });
    }

    // ── Atomic guarded transition (Accepted → Completed), exactly-once ────────
    // A single findOneAndUpdate keyed on { _id, status: Accepted } guarantees
    // the terminal transition happens at most once even under concurrency
    // (Req 5.2, 5.6, 13.4, 13.6). A null result means the application was not
    // in `Accepted` (wrong/terminal state) → ERR_2002.
    const updated = await this.applicationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(applicationId), status: ApplicationStatus.ACCEPTED },
      {
        $set: {
          status:      ApplicationStatus.COMPLETED,
          completedAt: new Date(),
          completedBy: employerProfile._id,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new ConflictException({
        errorCode: 'ERR_2002',
        message:
          'This application cannot be marked as completed because it is not ' +
          'in the Accepted state.',
      });
    }

    // ── Append audit log (best-effort — never rolls back the transition) ──────
    await this.auditService.append({
      actorId:    employerUserId,
      action:     AuditAction.APPLICATION_COMPLETED,
      targetType: AuditTargetType.APPLICATION,
      targetId:   applicationId,
      metadata:   {
        fromStatus: ApplicationStatus.ACCEPTED,
        toStatus:   ApplicationStatus.COMPLETED,
      },
    });

    // ── Emit domain event so both parties can be notified (Req 5.5) ───────────
    const event = new ApplicationCompletedEvent();
    event.applicationId   = applicationId;
    event.candidateUserId = application.candidateId.toString();
    event.employerUserId  = employerUserId;
    event.jobTitle        = populatedJob.title;
    event.companyName     = populatedJob.companyName;

    this.eventEmitter.emit('application.completed', event);

    return updated;
  }

  // ─── PUT /employers/applications/:id/no-show ───────────────────────────────

  /**
   * Marks an Accepted application as NoShow (Accepted → NoShow).
   *
   * Only the Employer that owns the Job referenced by the application may
   * perform this transition. `NoShow` is a terminal status: the transition is
   * permitted exactly once and only from `Accepted` (Req 6.1, 6.2, 6.6, 13.4,
   * 13.6). The employer may only report a no-show once the shift's
   * `scheduledAt` time has elapsed (Req 6.8).
   *
   * Ownership note: `Job.employerId` references `EmployerProfile._id`, NOT
   * `User._id`. The caller passes their own `User._id` (`employerUserId`); we
   * resolve their `EmployerProfile` and assert its `_id` equals the job's
   * `employerId` (Req 6.3, 12.4).
   *
   * Guards (in order):
   *   ERR_4001 — Application not found.
   *   ERR_2001 — Caller is not the employer that owns the referenced job.
   *   ERR_5002 — `scheduledAt` is missing or has not yet elapsed (Req 6.8).
   *   ERR_2002 — Application is not in `Accepted` (atomic guard matched zero
   *              docs — already terminal / wrong state) (Req 6.2, 13.4, 13.6).
   *
   * Side effects (on success):
   *   - Sets `status = NoShow`, `noShowAt = now`, `noShowReportedBy = employerProfile._id`.
   *   - Appends an `AuditLog` entry (`APPLICATION_NOSHOW`,
   *     `metadata: { fromStatus, toStatus }`) (Req 15.2).
   *   - Applies the No_Show_Penalty to the candidate's Trust Score — wired in
   *     Task 5.20 (see integration point below) (Req 4.5, 6.4).
   *   - Emits `application.no_show` so the candidate is notified (Req 6.5).
   *
   * @param applicationId  Application MongoDB ObjectId string.
   * @param employerUserId The calling employer's User._id (from the JWT).
   */
  async markNoShow(
    applicationId: string,
    employerUserId: string,
  ): Promise<ApplicationDocument> {
    // ── Load application + populate the job's employerId for ownership ────────
    const application = await this.applicationModel
      .findById(applicationId)
      .populate<{ jobId: JobDocument }>('jobId', 'title companyName employerId')
      .lean();

    if (!application) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Application with ID "${applicationId}" was not found.`,
      });
    }

    const populatedJob = application.jobId as unknown as JobDocument;

    // ── Resolve the caller's EmployerProfile and assert ownership ─────────────
    // Job.employerId refs EmployerProfile._id (not User._id), so we resolve the
    // caller's profile from their userId and compare profile._id to the job's
    // employerId (Req 6.3, 12.4).
    const employerProfile = await this.employerProfileModel
      .findOne({ userId: new Types.ObjectId(employerUserId) })
      .select('_id')
      .lean();

    const ownsJob =
      !!employerProfile &&
      populatedJob.employerId?.toString() === employerProfile._id.toString();

    if (!ownsJob) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have permission to report a no-show for this application.',
      });
    }

    // ── Assert the scheduled shift time has elapsed (Req 6.8) ─────────────────
    // The employer cannot report a no-show before the shift was due. This guard
    // runs BEFORE the atomic update so the application's status is left
    // unchanged when the shift has not yet started. A missing `scheduledAt` also
    // fails this guard (we cannot confirm the shift has elapsed).
    const now = new Date();
    if (!application.scheduledAt || new Date(application.scheduledAt) > now) {
      throw new BadRequestException({
        errorCode: 'ERR_5002',
        message:
          'This application cannot be marked as a no-show before its ' +
          'scheduled shift time has elapsed.',
      });
    }

    // ── Atomic guarded transition (Accepted → NoShow), exactly-once ───────────
    // A single findOneAndUpdate keyed on { _id, status: Accepted } guarantees
    // the terminal transition happens at most once even under concurrency
    // (Req 6.2, 6.6, 13.4, 13.6). A null result means the application was not
    // in `Accepted` (wrong/terminal state) → ERR_2002. Because the penalty is
    // applied only on this exactly-once branch, the No_Show_Penalty is applied
    // at most once (Req 13.6).
    const updated = await this.applicationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(applicationId), status: ApplicationStatus.ACCEPTED },
      {
        $set: {
          status:           ApplicationStatus.NO_SHOW,
          noShowAt:         new Date(),
          noShowReportedBy: employerProfile._id,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new ConflictException({
        errorCode: 'ERR_2002',
        message:
          'This application cannot be marked as a no-show because it is not ' +
          'in the Accepted state.',
      });
    }

    // ── Trust Score penalty integration point (exactly-once branch) ───────────
    // We are past the atomic guarded update: `updated` is non-null, so this
    // request is the single one that performed the Accepted → NoShow transition.
    // Concurrent/repeated calls receive a null `updated` and throw ERR_2002
    // above, so the No_Show_Penalty is deducted from the candidate's Trust Score
    // at most once (Req 4.5, 6.4, 13.6). `application.candidateId` references the
    // candidate `User._id`, which is what `applyNoShowPenalty` expects.
    const candidateUserId = application.candidateId.toString();
    await this.trustScoreService.applyNoShowPenalty(candidateUserId);

    // ── Append audit log (best-effort — never rolls back the transition) ──────
    await this.auditService.append({
      actorId:    employerUserId,
      action:     AuditAction.APPLICATION_NOSHOW,
      targetType: AuditTargetType.APPLICATION,
      targetId:   applicationId,
      metadata:   {
        fromStatus: ApplicationStatus.ACCEPTED,
        toStatus:   ApplicationStatus.NO_SHOW,
      },
    });

    // ── Emit domain event so the candidate can be notified (Req 6.5) ──────────
    const event = new ApplicationNoShowEvent();
    event.applicationId   = applicationId;
    event.candidateUserId = application.candidateId.toString();
    event.jobTitle        = populatedJob.title;
    event.companyName     = populatedJob.companyName;

    this.eventEmitter.emit('application.no_show', event);

    return updated;
  }
}
