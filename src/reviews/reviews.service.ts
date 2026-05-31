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

import { Review, ReviewDocument, ReviewDirection } from './schemas/review.schema';
import {
  Application,
  ApplicationDocument,
  ApplicationStatus,
} from '../applications/schemas/application.schema';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import {
  EmployerProfile,
  EmployerProfileDocument,
  EmployerStatus,
} from '../employers/schemas/employer-profile.schema';
import {
  Profile,
  ProfileDocument,
  VerificationStatus,
} from '../profiles/schemas/profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { TrustScoreService } from './trust-score.service';
import { ReviewCreatedEvent } from '../notifications/events/review.events';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { AdminReviewQueryDto } from './dto/admin-review-query.dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditTargetType,
} from '../audit/schemas/audit-log.schema';

/**
 * Standard `{ data, meta }` pagination envelope used across the codebase
 * (notifications, applications, jobs, audit, reports, …).
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
 * A single review as surfaced on the public reviewee list (Req 2.2).
 *
 * Carries only the publicly-relevant fields: the rating, the comment
 * (represented as an empty string when absent — Req 2.7), the reviewer's
 * display name, the creation timestamp, and the review direction.
 */
export interface ReviewView {
  id: string;
  rating: number;
  comment: string;
  reviewerDisplayName: string;
  createdAt: Date;
  direction: ReviewDirection;
}

/**
 * Aggregate trust read returned by `GET /profiles/:userId/trust` (Req 2.3–2.5,
 * 9.1–9.5).
 *
 * `verified` is the composed Verified_Badge indicator (Req 9): it is `true`
 * when the user holds a candidate `Profile` whose `verificationStatus` is
 * `VERIFIED` (Req 9.1) OR an `EmployerProfile` whose `status` is `APPROVED`
 * (Req 9.2). A user holding both profiles is verified if EITHER condition holds
 * (Req 9.3); none of the verified states yields `false` (Req 9.4); and an
 * unreadable/missing status is treated as not verified (Req 9.5).
 */
export interface TrustView {
  trustScore: number;
  averageRating: number;
  reviewCount: number;
  provisional: boolean;
  verified: boolean;
}

/**
 * ReviewsService
 *
 * Owns the creation, aggregation gateway, and (later) moderation of Reviews.
 * This file currently implements `create()` (task 5.9); read and moderation
 * surfaces are added in task 5.15.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,

    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,

    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,

    @InjectModel(EmployerProfile.name)
    private readonly employerProfileModel: Model<EmployerProfileDocument>,

    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly trustScoreService: TrustScoreService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── POST /reviews ──────────────────────────────────────────────────────────

  /**
   * Creates a Review for a Completed application (Req 1.1–1.10, 6.7, 13.1, 13.3).
   *
   * Guards (in order):
   *   ERR_4001 (404) — Application not found.
   *   ERR_5001 (400) — Application is not `Completed` (covers `NoShow` per Req 6.7
   *                    and every other non-terminal/terminal non-completed state).
   *   ERR_2001 (403) — Reviewer is neither the application's candidate nor the
   *                    employer that owns the referenced job (Req 1.7).
   *   ERR_4002 (409) — A review already exists for this (application, direction)
   *                    — caught from the unique index, the authoritative guard
   *                    (Req 1.8, 13.1, 13.3).
   *
   * Direction + reviewee resolution (Req 1.4, 1.5):
   *   - Candidate reviewer → CANDIDATE_TO_EMPLOYER, reviewee = the employer's
   *     User._id (resolved from the job's EmployerProfile).
   *   - Owning-employer reviewer → EMPLOYER_TO_CANDIDATE, reviewee = the
   *     application's candidate (User._id).
   *
   * Side effects (on success):
   *   - Recalculates and persists the reviewee's trust aggregates (Req 4.1).
   *   - Emits `review.created` so the reviewee is notified (Req 14.1).
   *
   * @param reviewerUserId The authenticated reviewer's User._id (from the JWT).
   * @param dto            Validated review payload (applicationId, rating, comment).
   */
  async create(
    reviewerUserId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewDocument> {
    // ── Load the application + populate the job for employer/owner context ────
    const application = await this.applicationModel
      .findById(dto.applicationId)
      .populate<{ jobId: JobDocument }>('jobId', 'employerId')
      .lean();

    if (!application) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Application with ID "${dto.applicationId}" was not found.`,
      });
    }

    // ── Guard: application must be Completed (Req 1.6, 6.7) ───────────────────
    if (application.status !== ApplicationStatus.COMPLETED) {
      throw new BadRequestException({
        errorCode: 'ERR_5001',
        message:
          'A review can only be submitted for an application that has been ' +
          `completed (current status: "${application.status}").`,
      });
    }

    const job = application.jobId as unknown as JobDocument;
    const candidateUserId = application.candidateId.toString();
    const jobId = (job as any)._id as Types.ObjectId;

    // ── Resolve review direction + reviewee (Req 1.4, 1.5, 1.7) ───────────────
    let direction: ReviewDirection;
    let revieweeId: Types.ObjectId;
    let revieweeRole: 'CANDIDATE' | 'EMPLOYER';

    if (reviewerUserId === candidateUserId) {
      // Candidate reviews the employer of the job (Req 1.5).
      // Job.employerId references EmployerProfile._id, so resolve that profile
      // to obtain the employer's underlying User._id.
      const employerProfile = await this.employerProfileModel
        .findById(job.employerId)
        .select('userId')
        .lean<{ userId: Types.ObjectId } | null>();

      if (!employerProfile) {
        throw new NotFoundException({
          errorCode: 'ERR_4001',
          message: 'The employer for the referenced job was not found.',
        });
      }

      direction = ReviewDirection.CANDIDATE_TO_EMPLOYER;
      revieweeId = employerProfile.userId;
      revieweeRole = 'EMPLOYER';
    } else {
      // Otherwise the reviewer must be the employer that OWNS the job.
      // Resolve the reviewer's EmployerProfile and compare its _id to the
      // job's employerId (which references EmployerProfile._id).
      const reviewerEmployerProfile = await this.employerProfileModel
        .findOne({ userId: new Types.ObjectId(reviewerUserId) })
        .select('_id')
        .lean<{ _id: Types.ObjectId } | null>();

      const ownsJob =
        !!reviewerEmployerProfile &&
        job.employerId?.toString() === reviewerEmployerProfile._id.toString();

      if (!ownsJob) {
        throw new ForbiddenException({
          errorCode: 'ERR_2001',
          message:
            'You do not have permission to review this application. Only the ' +
            'candidate or the employer that owns the job may leave a review.',
        });
      }

      // Employer reviews the application's candidate (Req 1.4).
      direction = ReviewDirection.EMPLOYER_TO_CANDIDATE;
      revieweeId = application.candidateId;
      revieweeRole = 'CANDIDATE';
    }

    // ── Insert the Review (unique { applicationId, direction } index) ─────────
    let review: ReviewDocument;
    try {
      review = await this.reviewModel.create({
        applicationId: application._id,
        reviewerId: new Types.ObjectId(reviewerUserId),
        revieweeId,
        direction,
        jobId,
        rating: dto.rating,
        comment: dto.comment ?? '',
      });
    } catch (error: any) {
      // Mongo duplicate-key error from the unique (applicationId, direction)
      // index is the authoritative concurrency guard (Req 1.8, 13.1, 13.3).
      if (error?.code === 11000) {
        throw new ConflictException({
          errorCode: 'ERR_4002',
          message:
            'You have already submitted a review for this application.',
        });
      }
      throw error;
    }

    // ── Recalculate the reviewee's trust aggregates (Req 4.1) ─────────────────
    await this.trustScoreService.recalculate(revieweeId.toString(), revieweeRole);

    // ── Emit review.created so the reviewee is notified (Req 14.1) ────────────
    const reviewerUser = await this.userModel
      .findById(reviewerUserId)
      .select('fullName')
      .lean<{ fullName?: string } | null>();

    const event = new ReviewCreatedEvent();
    event.reviewId = (review as any)._id.toString();
    event.revieweeUserId = revieweeId.toString();
    event.reviewerDisplayName = reviewerUser?.fullName ?? 'Người dùng';
    event.rating = review.rating;
    event.applicationId = dto.applicationId;

    this.eventEmitter.emit('review.created', event);

    return review;
  }

  // ─── GET /reviews ─────────────────────────────────────────────────────────

  /**
   * Lists a reviewee's currently-visible reviews, newest-first, paginated
   * (Req 2.1, 2.2, 2.6, 2.7).
   *
   * Only `hidden: false` reviews are returned (Req 2.6). Results are ordered by
   * `createdAt` descending and sliced by the validated `page`/`limit` (page ≥ 1,
   * default 10, max 100 — bounds enforced by {@link ReviewQueryDto}; out-of-range
   * values are rejected upstream with ERR_3001 per Req 2.8). Each review is
   * projected to a {@link ReviewView}, resolving the reviewer's display name and
   * representing a missing comment as an empty string (Req 2.7).
   *
   * @param revieweeId The reviewee's User._id whose visible reviews to list.
   * @param page       1-indexed page number (validated ≥ 1).
   * @param limit      Page size (validated 1..100).
   */
  async listForReviewee(
    revieweeId: string,
    page: number,
    limit: number,
  ): Promise<Paginated<ReviewView>> {
    const revieweeObjectId = new Types.ObjectId(revieweeId);
    const skip = (page - 1) * limit;

    const filter = { revieweeId: revieweeObjectId, hidden: false };

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<
          Array<{
            _id: Types.ObjectId;
            reviewerId: Types.ObjectId;
            rating: number;
            comment?: string;
            direction: ReviewDirection;
            createdAt: Date;
          }>
        >(),
      this.reviewModel.countDocuments(filter),
    ]);

    // Resolve reviewer display names in a single round-trip (Req 2.2).
    const reviewerIds = reviews.map((r) => r.reviewerId);
    const reviewers = await this.userModel
      .find({ _id: { $in: reviewerIds } })
      .select('fullName')
      .lean<Array<{ _id: Types.ObjectId; fullName?: string }>>();

    const nameById = new Map<string, string>(
      reviewers.map((u) => [u._id.toString(), u.fullName ?? 'Người dùng']),
    );

    const data: ReviewView[] = reviews.map((r) => ({
      id: r._id.toString(),
      rating: r.rating,
      // Represent a missing comment as an empty value (Req 2.7).
      comment: r.comment ?? '',
      reviewerDisplayName: nameById.get(r.reviewerId.toString()) ?? 'Người dùng',
      createdAt: r.createdAt,
      direction: r.direction,
    }));

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

  // ─── GET /profiles/:userId/trust ──────────────────────────────────────────

  /**
   * Returns the persisted trust aggregates and the composed Verified_Badge for a
   * profile (Req 2.3, 2.4, 2.5, 9.1–9.5).
   *
   * Reads BOTH the candidate `Profile` and the `EmployerProfile` for the given
   * user (a single user may hold both — Req 9.3). The persisted aggregates
   * already encode the empty-state contract (Req 2.4: zeroed
   * `averageRating`/`reviewCount` when there are no visible reviews) and the
   * one-decimal-place average (Req 2.5), since {@link TrustScoreService} keeps
   * them in sync.
   *
   * Trust-aggregate selection preserves the prior behavior: prefer the candidate
   * `Profile`'s aggregates when a candidate profile exists, otherwise fall back
   * to the `EmployerProfile`'s aggregates.
   *
   * Verified_Badge composition (Req 9.1–9.5):
   *   verified = (candidate profile exists AND verificationStatus === VERIFIED)
   *              OR (employer profile exists AND status === APPROVED).
   * An unreadable/missing status never throws and is treated as not verified
   * (Req 9.5).
   *
   * If the user has neither profile, the reviewee/profile does not exist
   * (Req 2.9) and a `404 ERR_4001` is thrown.
   *
   * @param userId The profile owner's User._id.
   */
  async getTrust(userId: string): Promise<TrustView> {
    const userObjectId = new Types.ObjectId(userId);

    // Read BOTH profiles for correct badge composition (Req 9.3). A user may
    // hold a candidate profile, an employer profile, or both.
    const [candidate, employer] = await Promise.all([
      this.profileModel
        .findOne({ userId: userObjectId })
        .select('trustScore averageRating reviewCount provisional verificationStatus')
        .lean<{
          trustScore?: number;
          averageRating?: number;
          reviewCount?: number;
          provisional?: boolean;
          verificationStatus?: VerificationStatus;
        } | null>(),
      this.employerProfileModel
        .findOne({ userId: userObjectId })
        .select('trustScore averageRating reviewCount provisional status')
        .lean<{
          trustScore?: number;
          averageRating?: number;
          reviewCount?: number;
          provisional?: boolean;
          status?: EmployerStatus;
        } | null>(),
    ]);

    // Neither a candidate nor an employer profile exists (Req 2.9).
    if (!candidate && !employer) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `No profile was found for user "${userId}".`,
      });
    }

    // Compose the Verified_Badge from BOTH profiles (Req 9.1–9.5). Optional
    // chaining + strict equality means a missing/unreadable status simply
    // yields `false` — never a throw (Req 9.5).
    const verified =
      candidate?.verificationStatus === VerificationStatus.VERIFIED ||
      employer?.status === EmployerStatus.APPROVED;

    // Prefer the candidate aggregates when a candidate profile exists; otherwise
    // fall back to the employer aggregates (preserves prior selection behavior).
    const aggregates = candidate ?? employer!;

    return {
      trustScore: aggregates.trustScore ?? 0,
      averageRating: aggregates.averageRating ?? 0,
      reviewCount: aggregates.reviewCount ?? 0,
      provisional: aggregates.provisional ?? true,
      verified,
    };
  }

  // ─── GET /admin/reviews ───────────────────────────────────────────────────

  /**
   * Lists reviews for admin moderation, including hidden ones (Req 3.1 read
   * surface). Optionally filtered by `revieweeId` and visibility (`hidden`),
   * returned newest-first and paginated (default 20, max 100 — bounds enforced
   * by {@link AdminReviewQueryDto}).
   */
  async adminList(
    query: AdminReviewQueryDto,
  ): Promise<Paginated<ReviewDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (query.revieweeId) {
      filter.revieweeId = new Types.ObjectId(query.revieweeId);
    }
    if (query.hidden !== undefined) {
      filter.hidden = query.hidden;
    }

    const [data, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<ReviewDocument[]>(),
      this.reviewModel.countDocuments(filter),
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

  // ─── PATCH /admin/reviews/:id/hide ────────────────────────────────────────

  /**
   * Hides a currently-visible review with a moderation reason (Req 3.1, 3.6,
   * 3.7, 4.1, 15.1).
   *
   * Guards (in order):
   *   ERR_4001 (404) — review not found (Req 3.5).
   *   ERR_2002 (409) — review is already hidden (Req 3.6).
   *   ERR_3001 (400) — missing/blank reason or one exceeding 1,000 chars; the
   *                    {@link HideReviewDto} validators are the primary guard,
   *                    this is a defensive backstop (Req 3.7).
   *
   * On success: marks the review hidden, records the moderating admin, reason,
   * and timestamp (Req 3.1); appends a `REVIEW_HIDDEN` audit entry (Req 15.1);
   * and recalculates the reviewee's trust aggregates from the now-reduced set of
   * visible reviews (Req 3.3, 4.1).
   */
  async hide(
    reviewId: string,
    adminId: string,
    reason: string,
  ): Promise<ReviewDocument> {
    // Defensive validation backstop (the DTO is the primary guard — Req 3.7).
    const trimmedReason = (reason ?? '').trim();
    if (trimmedReason.length === 0 || trimmedReason.length > 1000) {
      throw new BadRequestException({
        errorCode: 'ERR_3001',
        message:
          'A moderation reason is required and must be at most 1,000 characters.',
      });
    }

    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Review with ID "${reviewId}" was not found.`,
      });
    }

    // Already hidden → conflict, no change (Req 3.6).
    if (review.hidden) {
      throw new ConflictException({
        errorCode: 'ERR_2002',
        message: 'This review is already hidden.',
      });
    }

    review.hidden = true;
    review.moderatedBy = new Types.ObjectId(adminId);
    review.moderationReason = trimmedReason;
    review.moderatedAt = new Date();
    await review.save();

    // Append an append-only audit record (best-effort — Req 15.1).
    await this.auditService.append({
      actorId: adminId,
      action: AuditAction.REVIEW_HIDDEN,
      targetType: AuditTargetType.REVIEW,
      targetId: reviewId,
      reason: trimmedReason,
    });

    // Recalculate the reviewee's aggregates from visible reviews (Req 3.3, 4.1).
    await this.trustScoreService.recalculate(
      review.revieweeId.toString(),
      this.revieweeRoleFor(review.direction),
    );

    return review;
  }

  // ─── PATCH /admin/reviews/:id/restore ─────────────────────────────────────

  /**
   * Restores a currently-hidden review (Req 3.2, 3.6, 4.1, 15.1).
   *
   * Guards (in order):
   *   ERR_4001 (404) — review not found (Req 3.5).
   *   ERR_2002 (409) — review is already visible (Req 3.6).
   *
   * On success: marks the review visible, records the restoring admin and
   * timestamp (Req 3.2); appends a `REVIEW_RESTORED` audit entry (Req 15.1); and
   * recalculates the reviewee's trust aggregates from the now-enlarged set of
   * visible reviews (Req 3.3, 4.1).
   */
  async restore(reviewId: string, adminId: string): Promise<ReviewDocument> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Review with ID "${reviewId}" was not found.`,
      });
    }

    // Already visible → conflict, no change (Req 3.6).
    if (!review.hidden) {
      throw new ConflictException({
        errorCode: 'ERR_2002',
        message: 'This review is already visible.',
      });
    }

    review.hidden = false;
    review.moderatedBy = new Types.ObjectId(adminId);
    review.moderatedAt = new Date();
    await review.save();

    // Append an append-only audit record (best-effort — Req 15.1).
    await this.auditService.append({
      actorId: adminId,
      action: AuditAction.REVIEW_RESTORED,
      targetType: AuditTargetType.REVIEW,
      targetId: reviewId,
    });

    // Recalculate the reviewee's aggregates from visible reviews (Req 3.3, 4.1).
    await this.trustScoreService.recalculate(
      review.revieweeId.toString(),
      this.revieweeRoleFor(review.direction),
    );

    return review;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Resolves the reviewee's role from a review's direction so trust aggregates
   * are persisted to the correct profile collection:
   *   CANDIDATE_TO_EMPLOYER → the reviewee is the EMPLOYER.
   *   EMPLOYER_TO_CANDIDATE → the reviewee is the CANDIDATE.
   */
  private revieweeRoleFor(
    direction: ReviewDirection,
  ): 'CANDIDATE' | 'EMPLOYER' {
    return direction === ReviewDirection.CANDIDATE_TO_EMPLOYER
      ? 'EMPLOYER'
      : 'CANDIDATE';
  }
}
