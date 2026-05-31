import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  AuditAction,
  AuditLog,
  AuditLogDocument,
  AuditTargetType,
} from './schemas/audit-log.schema';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * Shape of a single append into the append-only audit trail.
 *
 * Mirrors the `AuditService.append` signature in the design (Components →
 * "Cross-cutting — Audit"): captures the actor, action, target, optional
 * reason, and optional structured metadata (Req 15.1, 15.2).
 */
export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Standard `{ data, meta }` pagination envelope used across the codebase
 * (notifications, applications, jobs, …).
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
 * AuditService — owns the append-only trust-and-safety audit trail.
 *
 * Responsibilities:
 *   - `append`  — internal, best-effort write of an {@link AuditEntry}. It MUST
 *                 never throw or roll back the calling lifecycle/moderation
 *                 operation; persistence failures are caught and logged
 *                 (Req 15.3, Error Handling → audit append isolation).
 *   - `query`   — admin-only, read-only, paginated + filterable trail
 *                 (newest-first) for the `GET /admin/audit-logs` surface
 *                 (Req 15.1, 15.2, 15.4).
 *
 * There is intentionally no update/delete surface — the trail is append-only.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  // ─── append (internal, best-effort) ─────────────────────────────────────────

  /**
   * Appends a single record to the audit trail.
   *
   * Best-effort by contract: the persistence call is wrapped in a try/catch so
   * that an audit failure (DB hiccup, validation error, bad id) is logged but
   * never propagates to — or rolls back — the originating operation
   * (Error Handling → audit append isolation; Req 15.3).
   */
  async append(entry: AuditEntry): Promise<void> {
    try {
      await this.auditLogModel.create({
        actorId: new Types.ObjectId(entry.actorId),
        action: entry.action,
        targetType: entry.targetType,
        targetId: new Types.ObjectId(entry.targetId),
        reason: entry.reason,
        metadata: entry.metadata ?? null,
      });
    } catch (error) {
      // Swallow + log: auditing is a side effect and must never break the
      // caller's transaction (Req 15.3).
      this.logger.error(
        `[AuditService] Failed to append audit log ` +
          `(action=${entry.action}, actorId=${entry.actorId}, targetId=${entry.targetId}): ` +
          `${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // ─── query (admin read surface) ──────────────────────────────────────────────

  /**
   * Returns a paginated, newest-first slice of the audit trail, optionally
   * filtered by `actorId`, `action`, and/or `targetId` (Req 15.4).
   *
   * Pagination follows the shared envelope convention: 1-indexed `page`
   * (default 1), `limit` defaulting to 20 and capped at 100 (enforced by the
   * DTO validators), and `meta.totalPages` derived from the matched count.
   */
  async query(filter: AuditQueryDto): Promise<Paginated<AuditLogDocument>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const baseFilter: FilterQuery<AuditLogDocument> = {};

    if (filter.actorId) {
      baseFilter.actorId = new Types.ObjectId(filter.actorId);
    }
    if (filter.action) {
      baseFilter.action = filter.action;
    }
    if (filter.targetId) {
      baseFilter.targetId = new Types.ObjectId(filter.targetId);
    }

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(baseFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<AuditLogDocument[]>(),
      this.auditLogModel.countDocuments(baseFilter),
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
}
