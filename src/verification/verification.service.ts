import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import {
  Profile,
  ProfileDocument,
  IdentityDocument,
  VerificationStatus,
} from '../profiles/schemas/profile.schema';
import { UserRole } from '../users/schemas/user.schema';
import {
  SubmitVerificationDto,
  ALLOWED_IDENTITY_MIME_TYPES,
  MAX_IDENTITY_FILE_SIZE,
  MIN_IDENTITY_DOCS,
  MAX_IDENTITY_DOCS,
} from './dto/submit-verification.dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditTargetType,
} from '../audit/schemas/audit-log.schema';
import { VerificationDecidedEvent } from '../notifications/events/verification.events';

/**
 * Read-model returned to a candidate for their own verification state.
 * Exposes the verification status and the stored documents plus the decision
 * timestamps / rejection reason where present (Req 7.7).
 */
export interface VerificationView {
  verificationStatus: VerificationStatus;
  identityDocuments: IdentityDocument[];
  verificationSubmittedAt?: Date;
  verifiedAt?: Date;
  verificationRejectedReason?: string;
}

/**
 * Standard `{ data, meta }` pagination envelope used across the codebase
 * (notifications, applications, jobs, audit, reviews, …).
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
 * A single entry in the admin verification queue (Req 8.1).
 *
 * Carries the minimum a reviewing admin needs to triage a pending candidate:
 * the candidate's `User._id` (used to fetch documents / approve / reject), their
 * display name, the time they entered `PENDING_REVIEW` (queue ordering), and the
 * number of submitted documents.
 */
export interface VerificationQueueItem {
  userId: string;
  fullName: string;
  verificationSubmittedAt?: Date;
  documentCount: number;
}

/**
 * Capability 3 — Candidate Identity Verification.
 *
 * This service owns both sides of the verification flow:
 *   - Candidate-facing: submitting identity documents (`submit`) and reading
 *     one's own verification state (`getMine`).
 *   - Admin-facing: the review queue (`queue`), reading a candidate's documents
 *     for review (`getDocuments`), and the approve/reject decisions (`approve`,
 *     `reject`) which append to the audit trail and emit `verification.decided`.
 *
 * The controllers and module wiring are implemented in a separate task (7.8).
 */
@Injectable()
export class VerificationService {
  // MIME types accepted for identity documents (Req 7.2).
  private static readonly ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set(
    ALLOWED_IDENTITY_MIME_TYPES,
  );

  // Verification queue pagination defaults (Req 8.1: max 100 per page).
  private static readonly DEFAULT_QUEUE_LIMIT = 20;
  private static readonly MAX_QUEUE_LIMIT = 100;

  // Maximum length of a rejection reason (Req 8.7).
  private static readonly MAX_REJECT_REASON_LENGTH = 1000;

  constructor(
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── POST /verification/submit ─────────────────────────────────────────────

  /**
   * Submits 1–5 identity documents for admin review.
   *
   * State machine (Req 7.1, 7.4, 7.5, 7.8):
   *   UNVERIFIED | REJECTED  → PENDING_REVIEW (accepted)
   *   PENDING_REVIEW | VERIFIED → ERR_4003 (conflict, status unchanged)
   *
   * Defensive document validation (Req 7.2, 7.3): even though the DTO validates
   * declaratively, the service re-checks count (1–5), MIME set, and size (≤10 MB)
   * so an invalid submission stores no document and leaves the status unchanged.
   *
   * Guards (in order):
   *   ERR_4001 — Candidate profile not found.
   *   ERR_4003 — Already PENDING_REVIEW or VERIFIED (Req 7.4, 7.8).
   *   ERR_3001 — Document count / MIME / size validation failed (Req 7.3).
   *
   * @param candidateUserId The calling candidate's User._id (from the JWT).
   * @param dto             The submitted identity documents.
   */
  async submit(
    candidateUserId: string,
    dto: SubmitVerificationDto,
  ): Promise<VerificationView> {
    const profile = await this.loadProfileOrThrow(candidateUserId);

    // ── State-machine guard: only UNVERIFIED / REJECTED may submit ────────────
    // PENDING_REVIEW or VERIFIED → conflict; existing status + docs retained
    // (Req 7.4, 7.8). Checked BEFORE mutating anything (Req 7.3).
    if (
      profile.verificationStatus === VerificationStatus.PENDING_REVIEW ||
      profile.verificationStatus === VerificationStatus.VERIFIED
    ) {
      throw new ConflictException({
        errorCode: 'ERR_4003',
        message:
          'A verification submission cannot be made while your current status ' +
          `is "${profile.verificationStatus}".`,
      });
    }

    // ── Defensive document validation (Req 7.2, 7.3) ──────────────────────────
    // Reject before any write so nothing is stored and status stays unchanged.
    this.validateDocuments(dto.documents);

    // ── Persist: store documents, enter PENDING_REVIEW (Req 7.1, 7.5) ─────────
    profile.identityDocuments.splice(
      0,
      profile.identityDocuments.length,
      ...(dto.documents as unknown as IdentityDocument[]),
    );
    profile.verificationStatus = VerificationStatus.PENDING_REVIEW;
    profile.verificationSubmittedAt = new Date();
    // A fresh submission clears any prior rejection context.
    profile.verificationRejectedReason = undefined;

    await profile.save();

    return this.toView(profile);
  }

  // ─── GET /verification/me ──────────────────────────────────────────────────

  /**
   * Returns the calling candidate's own verification status and stored
   * documents (self-access — Req 7.7).
   *
   * Guards:
   *   ERR_4001 — Candidate profile not found.
   *
   * @param candidateUserId The calling candidate's User._id (from the JWT).
   */
  async getMine(candidateUserId: string): Promise<VerificationView> {
    const profile = await this.loadProfileOrThrow(candidateUserId);
    return this.toView(profile);
  }

  // ─── GET /admin/verifications ──────────────────────────────────────────────

  /**
   * Returns the admin verification queue: candidates whose `VerificationStatus`
   * is `PENDING_REVIEW`, ordered by `verificationSubmittedAt` ascending
   * (oldest-first — the order candidates entered the queue), paginated at no
   * more than 100 candidates per page (Req 8.1).
   *
   * Pagination follows the shared envelope convention: 1-indexed `page`
   * (default 1), `limit` defaulting to 20 and capped at 100. Out-of-range
   * values are clamped defensively here; the DTO/`ValidationPipe` is the primary
   * guard (ERR_3001) at the controller boundary (Task 7.8).
   *
   * @param page  1-indexed page number.
   * @param limit Page size (≤ 100).
   */
  async queue(
    page: number,
    limit: number,
  ): Promise<Paginated<VerificationQueueItem>> {
    const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
    const safeLimit =
      Number.isInteger(limit) && limit >= 1
        ? Math.min(limit, VerificationService.MAX_QUEUE_LIMIT)
        : VerificationService.DEFAULT_QUEUE_LIMIT;
    const skip = (safePage - 1) * safeLimit;

    const filter = {
      verificationStatus: VerificationStatus.PENDING_REVIEW,
    };

    const [profiles, total] = await Promise.all([
      this.profileModel
        .find(filter)
        // Oldest-first: the order candidates entered PENDING_REVIEW (Req 8.1).
        .sort({ verificationSubmittedAt: 1 })
        .skip(skip)
        .limit(safeLimit)
        .select('userId fullName verificationSubmittedAt identityDocuments')
        .lean<
          Array<{
            userId: Types.ObjectId;
            fullName?: string;
            verificationSubmittedAt?: Date;
            identityDocuments?: unknown[];
          }>
        >(),
      this.profileModel.countDocuments(filter),
    ]);

    const data: VerificationQueueItem[] = profiles.map((p) => ({
      userId: p.userId.toString(),
      fullName: p.fullName ?? '',
      verificationSubmittedAt: p.verificationSubmittedAt,
      documentCount: p.identityDocuments?.length ?? 0,
    }));

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // ─── GET /admin/verifications/:userId ──────────────────────────────────────

  /**
   * Returns a candidate's stored identity documents for review.
   *
   * Read access is restricted to the owning candidate and to admins (Req 7.7):
   * a requester who is neither the document owner nor an admin is rejected with
   * an authorization error (ERR_2001) and no documents are returned.
   *
   * Guards (in order):
   *   ERR_2001 (403) — requester is not the owning candidate and not an admin.
   *   ERR_4001 (404) — candidate profile not found.
   *
   * @param candidateUserId The candidate's User._id whose documents are read.
   * @param requesterId     The calling user's User._id (from the JWT).
   * @param requesterRole   The calling user's role (from the JWT).
   */
  async getDocuments(
    candidateUserId: string,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<IdentityDocument[]> {
    // ── Access control (Req 7.7): admin OR the owning candidate only ──────────
    const isAdmin = requesterRole === UserRole.ADMIN;
    const isOwner = requesterId === candidateUserId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:
          'You do not have permission to view these identity documents.',
      });
    }

    const profile = await this.loadProfileOrThrow(candidateUserId);
    return profile.identityDocuments;
  }

  // ─── PATCH /admin/verifications/:userId/approve ────────────────────────────

  /**
   * Approves a candidate's verification (`PENDING_REVIEW → VERIFIED`).
   *
   * Records the approving admin and approval timestamp (Req 8.2). Only a
   * candidate currently in `PENDING_REVIEW` may be approved; any other status
   * is rejected with a conflict error and the status is left unchanged
   * (ERR_2002 — Req 8.6).
   *
   * Guards (in order):
   *   ERR_4001 (404) — candidate profile not found.
   *   ERR_2002 (409) — candidate is not in `PENDING_REVIEW` (Req 8.6).
   *
   * Side effects (on success):
   *   - Sets `verificationStatus = VERIFIED`, `verifiedAt = now`,
   *     `verifiedBy = adminId`.
   *   - Appends an `AuditLog` entry (`VERIFICATION_APPROVED`) (Req 15.1).
   *   - Emits `verification.decided` so the candidate is notified (Req 8.4).
   *
   * @param candidateUserId The candidate's User._id to approve.
   * @param adminId         The approving admin's User._id (from the JWT).
   */
  async approve(
    candidateUserId: string,
    adminId: string,
  ): Promise<VerificationView> {
    const profile = await this.loadProfileOrThrow(candidateUserId);

    // Only PENDING_REVIEW may be decided; otherwise conflict, no change (Req 8.6).
    if (profile.verificationStatus !== VerificationStatus.PENDING_REVIEW) {
      throw new ConflictException({
        errorCode: 'ERR_2002',
        message:
          'This candidate cannot be approved because their verification ' +
          `status is "${profile.verificationStatus}", not PENDING_REVIEW.`,
      });
    }

    // ── Persist the approval (Req 8.2) ────────────────────────────────────────
    profile.verificationStatus = VerificationStatus.VERIFIED;
    profile.verifiedAt = new Date();
    profile.verifiedBy = new Types.ObjectId(adminId);
    // A clean approval clears any stale rejection context.
    profile.verificationRejectedReason = undefined;
    await profile.save();

    // ── Append an append-only audit record (best-effort — Req 15.1) ───────────
    await this.auditService.append({
      actorId: adminId,
      action: AuditAction.VERIFICATION_APPROVED,
      targetType: AuditTargetType.USER,
      targetId: candidateUserId,
    });

    // ── Emit domain event so the candidate is notified (Req 8.4) ──────────────
    const event = new VerificationDecidedEvent();
    event.candidateUserId = candidateUserId;
    event.status = 'VERIFIED';
    this.eventEmitter.emit('verification.decided', event);

    return this.toView(profile);
  }

  // ─── PATCH /admin/verifications/:userId/reject ─────────────────────────────

  /**
   * Rejects a candidate's verification (`PENDING_REVIEW → REJECTED`) with a
   * reason of at most 1,000 characters.
   *
   * Records the rejecting admin, the reason, and the rejection timestamp
   * (Req 8.3). Only a candidate currently in `PENDING_REVIEW` may be rejected;
   * any other status is rejected with a conflict error and the status is left
   * unchanged (ERR_2002 — Req 8.6).
   *
   * Schema note: the candidate `Profile` has no dedicated `rejectedAt`/
   * `rejectedBy` fields, so we reuse the existing `verifiedBy` field to record
   * the deciding admin and `verifiedAt` to record the decision timestamp, in
   * addition to `verificationRejectedReason` for the reason. This follows the
   * task guidance to use the schema fields that already exist rather than
   * inventing new ones.
   *
   * Guards (in order):
   *   ERR_4001 (404) — candidate profile not found.
   *   ERR_2002 (409) — candidate is not in `PENDING_REVIEW` (Req 8.6).
   *   ERR_3001 (400) — missing/blank reason or one exceeding 1,000 chars; the
   *                    reject DTO is the primary guard (Task 7.8), this is a
   *                    defensive backstop (Req 8.7).
   *
   * Side effects (on success):
   *   - Sets `verificationStatus = REJECTED`, `verificationRejectedReason`,
   *     `verifiedBy = adminId` (deciding admin), `verifiedAt = now` (decision time).
   *   - Appends an `AuditLog` entry (`VERIFICATION_REJECTED`, with reason) (Req 15.1).
   *   - Emits `verification.decided` so the candidate is notified (Req 8.4).
   *
   * @param candidateUserId The candidate's User._id to reject.
   * @param adminId         The rejecting admin's User._id (from the JWT).
   * @param reason          The rejection reason (1–1000 chars).
   */
  async reject(
    candidateUserId: string,
    adminId: string,
    reason: string,
  ): Promise<VerificationView> {
    // Defensive validation backstop (the DTO is the primary guard — Req 8.7).
    const trimmedReason = (reason ?? '').trim();
    if (
      trimmedReason.length === 0 ||
      trimmedReason.length > VerificationService.MAX_REJECT_REASON_LENGTH
    ) {
      throw new BadRequestException({
        errorCode: 'ERR_3001',
        message:
          'A rejection reason is required and must be at most 1,000 characters.',
      });
    }

    const profile = await this.loadProfileOrThrow(candidateUserId);

    // Only PENDING_REVIEW may be decided; otherwise conflict, no change (Req 8.6).
    if (profile.verificationStatus !== VerificationStatus.PENDING_REVIEW) {
      throw new ConflictException({
        errorCode: 'ERR_2002',
        message:
          'This candidate cannot be rejected because their verification ' +
          `status is "${profile.verificationStatus}", not PENDING_REVIEW.`,
      });
    }

    // ── Persist the rejection (Req 8.3) ───────────────────────────────────────
    // Reuse verifiedBy/verifiedAt to record the deciding admin + decision time
    // (no dedicated rejectedAt/rejectedBy fields exist on the schema).
    profile.verificationStatus = VerificationStatus.REJECTED;
    profile.verificationRejectedReason = trimmedReason;
    profile.verifiedBy = new Types.ObjectId(adminId);
    profile.verifiedAt = new Date();
    await profile.save();

    // ── Append an append-only audit record (best-effort — Req 15.1) ───────────
    await this.auditService.append({
      actorId: adminId,
      action: AuditAction.VERIFICATION_REJECTED,
      targetType: AuditTargetType.USER,
      targetId: candidateUserId,
      reason: trimmedReason,
    });

    // ── Emit domain event so the candidate is notified (Req 8.4) ──────────────
    const event = new VerificationDecidedEvent();
    event.candidateUserId = candidateUserId;
    event.status = 'REJECTED';
    event.reason = trimmedReason;
    this.eventEmitter.emit('verification.decided', event);

    return this.toView(profile);
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Loads the candidate's Profile by `userId`. A candidate is expected to have a
   * profile, so its absence is a not-found condition (ERR_4001).
   */
  private async loadProfileOrThrow(
    candidateUserId: string,
  ): Promise<ProfileDocument> {
    const profile = await this.profileModel.findOne({
      userId: new Types.ObjectId(candidateUserId),
    });

    if (!profile) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Your candidate profile was not found.',
      });
    }

    return profile;
  }

  /**
   * Defensive guard mirroring the DTO rules (Req 7.2, 7.3). Throws ERR_3001 on:
   *   - fewer than 1 or more than 5 documents,
   *   - any document whose MIME type is not JPEG/PNG/PDF,
   *   - any document whose size is not > 0 and ≤ 10 MB.
   * Throwing here guarantees no document is stored and the status is unchanged.
   */
  private validateDocuments(documents: SubmitVerificationDto['documents']): void {
    if (
      !Array.isArray(documents) ||
      documents.length < MIN_IDENTITY_DOCS ||
      documents.length > MAX_IDENTITY_DOCS
    ) {
      throw new BadRequestException({
        errorCode: 'ERR_3001',
        message: `A verification submission must contain between ${MIN_IDENTITY_DOCS} and ${MAX_IDENTITY_DOCS} identity documents.`,
      });
    }

    for (const doc of documents) {
      if (!VerificationService.ALLOWED_MIME_TYPES.has(doc.mimeType)) {
        throw new BadRequestException({
          errorCode: 'ERR_3001',
          message: `Unsupported document format "${doc.mimeType}". Allowed formats: ${ALLOWED_IDENTITY_MIME_TYPES.join(', ')}.`,
        });
      }

      if (
        !Number.isInteger(doc.fileSize) ||
        doc.fileSize <= 0 ||
        doc.fileSize > MAX_IDENTITY_FILE_SIZE
      ) {
        throw new BadRequestException({
          errorCode: 'ERR_3001',
          message: `Document "${doc.fileName}" exceeds the maximum allowed size of 10 MB or is empty.`,
        });
      }
    }
  }

  /** Projects a Profile document onto the candidate-facing verification view. */
  private toView(profile: ProfileDocument): VerificationView {
    return {
      verificationStatus: profile.verificationStatus,
      identityDocuments: profile.identityDocuments,
      verificationSubmittedAt: profile.verificationSubmittedAt,
      verifiedAt: profile.verifiedAt,
      verificationRejectedReason: profile.verificationRejectedReason,
    };
  }
}
