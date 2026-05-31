import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ACTIVE_REPORT_STATUSES,
  Report,
  ReportDocument,
  ReportStatus,
  ReportTargetType,
} from './schemas/report.schema';
import { Job, JobDocument, JobStatus } from '../jobs/schemas/job.schema';
import { User, UserDocument, UserStatus } from '../users/schemas/user.schema';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportQueueDto } from './dto/report-queue.dto';
import {
  ReportCreatedEvent,
  ReportResolvedEvent,
} from '../notifications/events/report.events';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditTargetType,
} from '../audit/schemas/audit-log.schema';

/**
 * Standard `{ data, meta }` pagination envelope used across the codebase
 * (notifications, applications, jobs, audit, …).
 */
export interface Paginated<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * The {@link ReportStatus} values considered terminal: once a report reaches
 * one of these, it can no longer be opened, resolved, or dismissed (Req 11.8).
 */
const TERMINAL_REPORT_STATUSES: readonly ReportStatus[] = [
  ReportStatus.RESOLVED,
  ReportStatus.DISMISSED,
];

/**
 * MongoDB duplicate-key error code, raised when an insert/update violates a
 * unique index — here, the partial unique index that backs the active-report
 * uniqueness guard (Req 13.2). Used as the concurrency backstop for ERR_4002.
 */
const MONGO_DUPLICATE_KEY = 11000;

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,

    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly eventEmitter: EventEmitter2,

    private readonly auditService: AuditService,
  ) {}

  // ─── POST /reports ───────────────────────────────────────────────────────────

  /**
   * File a new report against a Job or another user (Req 10.1, 10.2).
   *
   * Guards (in order):
   *   1. Self-report   — USER target equal to the reporter → ERR_5003 (Req 10.8).
   *   2. Target exists — referenced Job (JOB) or User (USER) must exist, else
   *                      ERR_4001 (Req 10.5).
   *   3. No active dup — an existing OPEN/UNDER_REVIEW report by the same reporter
   *                      on the same target → ERR_4002 (Req 10.6, 13.2). The
   *                      partial unique index is the concurrency backstop and is
   *                      also translated to ERR_4002 (Req 13.3).
   *
   * On success the report is persisted with status OPEN (Req 10.1, 10.2) and a
   * `report.created` domain event is emitted for the notification pipeline (Req 10.9).
   *
   * Note: reason-enum and description-length validation (Req 10.3, 10.4, 10.7) are
   * enforced declaratively by {@link CreateReportDto} via the global ValidationPipe.
   */
  async create(
    reporterUserId: string,
    dto: CreateReportDto,
  ): Promise<ReportDocument> {
    const reporterObjectId = new Types.ObjectId(reporterUserId);
    const targetObjectId   = new Types.ObjectId(dto.targetId);

    // ── Guard 1: Self-report (USER target == reporter) ──────────────────────────
    if (
      dto.targetType === ReportTargetType.USER &&
      dto.targetId === reporterUserId
    ) {
      throw new BadRequestException({
        errorCode: 'ERR_5003',
        message:   'You cannot file a report against your own account.',
      });
    }

    // ── Guard 2: Target Job / User must exist ───────────────────────────────────
    if (dto.targetType === ReportTargetType.JOB) {
      const jobExists = await this.jobModel.exists({ _id: targetObjectId });
      if (!jobExists) {
        throw new NotFoundException({
          errorCode: 'ERR_4001',
          message:   `Job with ID "${dto.targetId}" was not found.`,
        });
      }
    } else {
      const userExists = await this.userModel.exists({ _id: targetObjectId });
      if (!userExists) {
        throw new NotFoundException({
          errorCode: 'ERR_4001',
          message:   `User with ID "${dto.targetId}" was not found.`,
        });
      }
    }

    // ── Guard 3: No existing active report by this reporter on this target ──────
    const existingActive = await this.reportModel.exists({
      reporterId: reporterObjectId,
      targetType: dto.targetType,
      targetId:   targetObjectId,
      status:     { $in: ACTIVE_REPORT_STATUSES },
    });

    if (existingActive) {
      throw new ConflictException({
        errorCode: 'ERR_4002',
        message:
          'You already have an active report for this target awaiting review.',
      });
    }

    // ── Persist (status OPEN; pre-save hook sets `active` from status) ──────────
    let report: ReportDocument;
    try {
      report = await this.reportModel.create({
        reporterId:  reporterObjectId,
        targetType:  dto.targetType,
        targetId:    targetObjectId,
        reason:      dto.reason,
        description: dto.description,
        status:      ReportStatus.OPEN,
      });
    } catch (error: any) {
      // Concurrency backstop: the partial unique index rejected a duplicate
      // active report that slipped past the check above (Req 13.3).
      if (error?.code === MONGO_DUPLICATE_KEY) {
        throw new ConflictException({
          errorCode: 'ERR_4002',
          message:
            'You already have an active report for this target awaiting review.',
        });
      }
      throw error;
    }

    // ── Emit domain event (decoupled — listener notifies admins, Req 10.9) ──────
    const event = new ReportCreatedEvent();
    event.reportId   = (report as any)._id.toString();
    event.targetType = report.targetType;
    event.targetId   = report.targetId.toString();

    this.eventEmitter.emit('report.created', event);

    return report;
  }

  // ─── GET /admin/reports (queue) ──────────────────────────────────────────────

  /**
   * Returns a paginated, newest-first slice of the report queue, optionally
   * filtered by `status` and/or `targetType` (Req 11.1).
   *
   * Pagination follows the shared envelope convention: 1-indexed `page`
   * (default 1), `limit` defaulting to 20 and capped at 100 (enforced by the
   * DTO validators), and `meta.totalPages` derived from the matched count.
   */
  async queue(query: ReportQueueDto): Promise<Paginated<ReportDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const baseFilter: FilterQuery<ReportDocument> = {};
    if (query.status) {
      baseFilter.status = query.status;
    }
    if (query.targetType) {
      baseFilter.targetType = query.targetType;
    }

    const [data, total] = await Promise.all([
      this.reportModel
        .find(baseFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<ReportDocument[]>(),
      this.reportModel.countDocuments(baseFilter),
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

  // ─── PATCH /admin/reports/:id/review ─────────────────────────────────────────

  /**
   * Opens an OPEN report for handling, assigning it to the acting admin and
   * transitioning OPEN → UNDER_REVIEW (Req 11.2).
   *
   * Implemented as an atomic guarded update keyed on `{ _id, status: OPEN }` so
   * that concurrent attempts to open the same report can never produce two
   * assignments. When the update matches nothing, the report is disambiguated:
   *   - missing                       → ERR_4001 (NotFoundException).
   *   - already terminal (RESOLVED/DISMISSED) → ERR_2002 (ConflictException, Req 11.8).
   *   - otherwise already UNDER_REVIEW (re-open) → ERR_2002 (Req 11.8).
   *
   * No audit row is appended on review assignment: the {@link AuditAction} set
   * only models REPORT_RESOLVED / REPORT_DISMISSED, so auditing is reserved for
   * the terminal resolve/dismiss transitions.
   */
  async review(reportId: string, adminId: string): Promise<ReportDocument> {
    const reportObjectId = new Types.ObjectId(reportId);
    const now = new Date();

    const updated = await this.reportModel.findOneAndUpdate(
      { _id: reportObjectId, status: ReportStatus.OPEN },
      {
        $set: {
          status: ReportStatus.UNDER_REVIEW,
          assignedAdminId: new Types.ObjectId(adminId),
          assignedAt: now,
          // Document middleware does not run for findOneAndUpdate, so the
          // denormalised `active` flag must be set explicitly. UNDER_REVIEW is
          // an active status, so it remains true.
          active: true,
        },
      },
      { new: true },
    );

    if (updated) {
      return updated;
    }

    // Update matched nothing — disambiguate not-found vs invalid-state.
    const existing = await this.reportModel.findById(reportObjectId).lean();
    if (!existing) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Report with ID "${reportId}" was not found.`,
      });
    }

    // Report exists but was not OPEN (terminal or already UNDER_REVIEW).
    throw new ConflictException({
      errorCode: 'ERR_2002',
      message: `Report cannot be opened for review from status "${existing.status}".`,
    });
  }

  // ─── PATCH /admin/reports/:id/resolve ────────────────────────────────────────

  /**
   * Resolves a report and enforces against its target (Req 11.3, 11.4).
   *
   * Guards (in order):
   *   - missing report            → ERR_4001 (Req 11.9 family / not found).
   *   - already terminal          → ERR_2002 (Req 11.8).
   * Enforcement:
   *   - JOB  target → set Job.status = closed; missing job  → ERR_4001 (Req 11.9).
   *   - USER target → set User.status = blocked; missing user → ERR_4001 (Req 11.9).
   *
   * The report is then transitioned to RESOLVED with `resolvedBy`/`resolvedAt`
   * recorded and `active` cleared (set explicitly in `$set` because the pre-save
   * hook does not run for findOneAndUpdate). An audit row (REPORT_RESOLVED) is
   * appended and a `report.resolved` event is emitted for the notification
   * pipeline (Req 11.6, 15.1).
   */
  async resolve(reportId: string, adminId: string): Promise<ReportDocument> {
    const reportObjectId = new Types.ObjectId(reportId);

    // ── Load report; disambiguate not-found vs already-terminal ────────────────
    const report = await this.reportModel.findById(reportObjectId);
    if (!report) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Report with ID "${reportId}" was not found.`,
      });
    }
    if (TERMINAL_REPORT_STATUSES.includes(report.status)) {
      throw new ConflictException({
        errorCode: 'ERR_2002',
        message: `Report has already been ${report.status.toLowerCase()} and cannot be resolved again.`,
      });
    }

    // ── Block the referenced target (Job → closed / User → blocked) ────────────
    if (report.targetType === ReportTargetType.JOB) {
      const blocked = await this.jobModel.findByIdAndUpdate(
        report.targetId,
        { $set: { status: JobStatus.CLOSED } },
        { new: true },
      );
      if (!blocked) {
        // Referenced job no longer exists — leave the report unchanged (Req 11.9).
        throw new NotFoundException({
          errorCode: 'ERR_4001',
          message: `Job with ID "${report.targetId.toString()}" no longer exists and cannot be blocked.`,
        });
      }
    } else {
      const blocked = await this.userModel.findByIdAndUpdate(
        report.targetId,
        { $set: { status: UserStatus.BLOCKED } },
        { new: true },
      );
      if (!blocked) {
        // Referenced user no longer exists — leave the report unchanged (Req 11.9).
        throw new NotFoundException({
          errorCode: 'ERR_4001',
          message: `User with ID "${report.targetId.toString()}" no longer exists and cannot be blocked.`,
        });
      }
    }

    // ── Transition the report to RESOLVED ──────────────────────────────────────
    const now = new Date();
    report.status = ReportStatus.RESOLVED;
    report.resolvedBy = new Types.ObjectId(adminId);
    report.resolvedAt = now;
    // Terminal status — clear the active flag so the partial unique index frees
    // up this (reporter, target) slot. The pre-save hook also recomputes this,
    // but we set it explicitly for clarity.
    report.active = false;
    await report.save();

    // ── Append audit row (best-effort; never rolls back) (Req 15.1) ────────────
    await this.auditService.append({
      actorId: adminId,
      action: AuditAction.REPORT_RESOLVED,
      targetType: AuditTargetType.REPORT,
      targetId: reportId,
      metadata: {
        targetType: report.targetType,
        targetId: report.targetId.toString(),
      },
    });

    // ── Emit domain event (reporter is notified of the outcome) (Req 11.6) ─────
    const event = new ReportResolvedEvent();
    event.reporterUserId = report.reporterId.toString();
    event.reportId = (report as any)._id.toString();
    event.status = 'RESOLVED';

    this.eventEmitter.emit('report.resolved', event);

    return report;
  }

  // ─── PATCH /admin/reports/:id/dismiss ────────────────────────────────────────

  /**
   * Dismisses a report without enforcing against its target, transitioning it to
   * DISMISSED and recording the dismissing admin, reason, and timestamp
   * (Req 11.5).
   *
   * Guards:
   *   - missing report   → ERR_4001 (NotFoundException).
   *   - already terminal → ERR_2002 (ConflictException, Req 11.8).
   *
   * An audit row (REPORT_DISMISSED) is appended and a `report.resolved` event is
   * emitted with status DISMISSED for the notification pipeline (Req 11.6, 15.1).
   */
  async dismiss(
    reportId: string,
    adminId: string,
    reason: string,
  ): Promise<ReportDocument> {
    const reportObjectId = new Types.ObjectId(reportId);

    // ── Load report; disambiguate not-found vs already-terminal ────────────────
    const report = await this.reportModel.findById(reportObjectId);
    if (!report) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Report with ID "${reportId}" was not found.`,
      });
    }
    if (TERMINAL_REPORT_STATUSES.includes(report.status)) {
      throw new ConflictException({
        errorCode: 'ERR_2002',
        message: `Report has already been ${report.status.toLowerCase()} and cannot be dismissed.`,
      });
    }

    // ── Transition the report to DISMISSED ─────────────────────────────────────
    const now = new Date();
    report.status = ReportStatus.DISMISSED;
    report.resolvedBy = new Types.ObjectId(adminId);
    report.resolvedAt = now;
    report.resolutionReason = reason;
    report.active = false;
    await report.save();

    // ── Append audit row (best-effort; never rolls back) (Req 15.1) ────────────
    await this.auditService.append({
      actorId: adminId,
      action: AuditAction.REPORT_DISMISSED,
      targetType: AuditTargetType.REPORT,
      targetId: reportId,
      reason,
    });

    // ── Emit domain event (reporter is notified of the outcome) (Req 11.6) ─────
    const event = new ReportResolvedEvent();
    event.reporterUserId = report.reporterId.toString();
    event.reportId = (report as any)._id.toString();
    event.status = 'DISMISSED';

    this.eventEmitter.emit('report.resolved', event);

    return report;
  }
}
