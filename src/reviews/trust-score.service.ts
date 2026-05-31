import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Profile, ProfileDocument } from '../profiles/schemas/profile.schema';
import {
  EmployerProfile,
  EmployerProfileDocument,
} from '../employers/schemas/employer-profile.schema';

/**
 * The role of the reviewee whose trust aggregates are being recalculated.
 * Determines which profile collection the aggregates are persisted to and
 * whether a `noShowCount` penalty basis applies (only candidates accumulate
 * no-shows — Req 4.5, 6.4).
 */
export type RevieweeRole = 'CANDIDATE' | 'EMPLOYER';

/**
 * Snapshot of a reviewee's persisted trust aggregates returned by the
 * stateful TrustScoreService methods.
 *
 * `noShowCount` is only meaningful for candidates (employers do not accumulate
 * no-shows per task 5.2) and is therefore optional.
 */
export interface TrustAggregate {
  trustScore: number;
  averageRating: number;
  reviewCount: number;
  provisional: boolean;
  noShowCount?: number;
}

/**
 * TrustScoreService
 *
 * Owns the calculation and persistence of a user's Trust Score.
 *
 * - `computeTrustScore` (task 5.3) — the pure, I/O-free score formula.
 * - `recalculate`       (task 5.6) — re-aggregates a reviewee's currently-visible
 *                                    reviews and persists avg/count/provisional/score
 *                                    in a single write (Req 4.1–4.4, 4.6, 4.7, 13.5, 13.7).
 * - `applyNoShowPenalty`(task 5.6) — atomically increments a candidate's
 *                                    `noShowCount` and recomputes the clamped
 *                                    Trust Score (Req 4.5, 6.4).
 */
@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);

  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,

    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,

    @InjectModel(EmployerProfile.name)
    private readonly employerProfileModel: Model<EmployerProfileDocument>,
  ) {}

  /**
   * Pure Trust Score calculation (no I/O).
   *
   * Trust Score Algorithm (design: "Trust Score Algorithm"; Requirements 4.2, 4.5, 6.4):
   *   rawScore   = (averageRating / 5) * 100 - 10 * noShowCount
   *   trustScore = clamp(round(rawScore), 0, 100)
   *
   * @param averageRating mean of visible ratings, expected in [0, 5]
   * @param noShowCount   accumulated NoShow transitions for the candidate (>= 0)
   * @returns an integer Trust Score clamped to the range [0, 100]
   */
  computeTrustScore(averageRating: number, noShowCount: number): number {
    const raw = (averageRating / 5) * 100 - 10 * noShowCount;
    return Math.min(100, Math.max(0, Math.round(raw)));
  }

  /**
   * Recalculates and persists a reviewee's trust aggregates from their
   * currently-visible reviews (Req 4.1, 4.2, 4.3, 4.4, 4.7).
   *
   * Aggregation derives every value from `hidden: false` reviews only
   * (Req 3.3, 13.5): `reviewCount` is the number of visible reviews,
   * `averageRating` is the mean of visible ratings rounded to one decimal place
   * (0 when none — Req 2.5), and `provisional` is true while there are fewer
   * than 3 visible reviews. For candidates, the score additionally subtracts the
   * persisted no-show penalty basis (`noShowCount`); employers have no
   * `noShowCount` (task 5.2) so 0 is used.
   *
   * All four values are computed in memory first and persisted in a SINGLE
   * `updateOne` keyed on `userId`. If aggregation or the write throws, the
   * failure is logged and the last successfully-persisted values are retained
   * without any partial update (Req 4.6). The aggregation reads the live set of
   * visible reviews at compute time, so concurrent recalculations converge on
   * values reflecting all then-committed reviews (Req 13.7).
   */
  async recalculate(
    revieweeUserId: string,
    revieweeRole: RevieweeRole,
  ): Promise<TrustAggregate> {
    const userObjectId = new Types.ObjectId(revieweeUserId);

    try {
      // 1. Aggregate ONLY currently-visible reviews (Req 3.3, 13.5).
      const [aggregate] = await this.reviewModel.aggregate<{
        reviewCount: number;
        ratingSum: number;
      }>([
        { $match: { revieweeId: userObjectId, hidden: false } },
        {
          $group: {
            _id: null,
            reviewCount: { $sum: 1 },
            ratingSum: { $sum: '$rating' },
          },
        },
      ]);

      const reviewCount = aggregate?.reviewCount ?? 0;
      const ratingSum = aggregate?.ratingSum ?? 0;

      // Unrounded mean is used for the score formula (precision); the stored
      // averageRating is rounded to one decimal place (Req 2.5).
      const rawMean = reviewCount > 0 ? ratingSum / reviewCount : 0;
      const averageRating = Math.round(rawMean * 10) / 10;

      // Provisional while fewer than 3 visible reviews (Req 4.4, 4.7).
      const provisional = reviewCount < 3;

      // No-show penalty basis: candidates carry `noShowCount`; employers do not.
      let noShowCount = 0;
      if (revieweeRole === 'CANDIDATE') {
        const profile = await this.profileModel
          .findOne({ userId: userObjectId })
          .select('noShowCount')
          .lean<{ noShowCount?: number } | null>();
        noShowCount = profile?.noShowCount ?? 0;
      }

      const trustScore = this.computeTrustScore(rawMean, noShowCount);

      // 2. Persist all four values in a SINGLE write (no partial update).
      const update = { averageRating, reviewCount, provisional, trustScore };
      if (revieweeRole === 'CANDIDATE') {
        await this.profileModel.updateOne({ userId: userObjectId }, { $set: update });
      } else {
        await this.employerProfileModel.updateOne(
          { userId: userObjectId },
          { $set: update },
        );
      }

      return {
        trustScore,
        averageRating,
        reviewCount,
        provisional,
        ...(revieweeRole === 'CANDIDATE' ? { noShowCount } : {}),
      };
    } catch (error) {
      // Retain last-good values, do not partial-update, and log (Req 4.6).
      this.logger.error(
        `[TrustScoreService] recalculate failed for ` +
          `revieweeUserId=${revieweeUserId}, role=${revieweeRole}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return this.readLastGood(userObjectId, revieweeRole);
    }
  }

  /**
   * Applies the no-show penalty to a candidate's Trust Score (Req 4.5, 6.4).
   *
   * Atomically increments the candidate profile's `noShowCount` by 1
   * (`findOneAndUpdate` with `{ new: true }`) so repeated or concurrent calls
   * each contribute exactly one deduction, then recomputes the Trust Score from
   * the stored `averageRating` and the new `noShowCount` and persists it
   * (clamped to [0, 100] by {@link computeTrustScore}).
   */
  async applyNoShowPenalty(candidateUserId: string): Promise<TrustAggregate> {
    const userObjectId = new Types.ObjectId(candidateUserId);

    // Atomic increment of the penalty basis (Req 6.4, 13.6).
    const profile = await this.profileModel.findOneAndUpdate(
      { userId: userObjectId },
      { $inc: { noShowCount: 1 } },
      { new: true },
    );

    if (!profile) {
      // Defensive: the candidate profile should exist by the time a no-show is
      // recorded. Log and return a safe default rather than rolling back the
      // already-committed lifecycle transition.
      this.logger.error(
        `[TrustScoreService] applyNoShowPenalty: no candidate profile found ` +
          `for candidateUserId=${candidateUserId}`,
      );
      return {
        trustScore: 0,
        averageRating: 0,
        reviewCount: 0,
        provisional: true,
        noShowCount: 0,
      };
    }

    const trustScore = this.computeTrustScore(
      profile.averageRating,
      profile.noShowCount,
    );

    await this.profileModel.updateOne(
      { userId: userObjectId },
      { $set: { trustScore } },
    );

    return {
      trustScore,
      averageRating: profile.averageRating,
      reviewCount: profile.reviewCount,
      provisional: profile.provisional,
      noShowCount: profile.noShowCount,
    };
  }

  /**
   * Reads the last successfully-persisted trust aggregates for a reviewee so a
   * failed {@link recalculate} can return the retained last-good values
   * (Req 4.6). Falls back to a zeroed aggregate if even the read fails.
   */
  private async readLastGood(
    userObjectId: Types.ObjectId,
    revieweeRole: RevieweeRole,
  ): Promise<TrustAggregate> {
    try {
      if (revieweeRole === 'CANDIDATE') {
        const profile = await this.profileModel
          .findOne({ userId: userObjectId })
          .select('trustScore averageRating reviewCount provisional noShowCount')
          .lean<{
            trustScore?: number;
            averageRating?: number;
            reviewCount?: number;
            provisional?: boolean;
            noShowCount?: number;
          } | null>();
        return {
          trustScore: profile?.trustScore ?? 0,
          averageRating: profile?.averageRating ?? 0,
          reviewCount: profile?.reviewCount ?? 0,
          provisional: profile?.provisional ?? true,
          noShowCount: profile?.noShowCount ?? 0,
        };
      }

      const employer = await this.employerProfileModel
        .findOne({ userId: userObjectId })
        .select('trustScore averageRating reviewCount provisional')
        .lean<{
          trustScore?: number;
          averageRating?: number;
          reviewCount?: number;
          provisional?: boolean;
        } | null>();
      return {
        trustScore: employer?.trustScore ?? 0,
        averageRating: employer?.averageRating ?? 0,
        reviewCount: employer?.reviewCount ?? 0,
        provisional: employer?.provisional ?? true,
      };
    } catch {
      return {
        trustScore: 0,
        averageRating: 0,
        reviewCount: 0,
        provisional: true,
        ...(revieweeRole === 'CANDIDATE' ? { noShowCount: 0 } : {}),
      };
    }
  }
}
