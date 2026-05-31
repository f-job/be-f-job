import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ReviewsController } from './reviews.controller';
import { AdminReviewsController } from './admin-reviews.controller';
import { ReviewsService } from './reviews.service';
import { TrustScoreService } from './trust-score.service';

import { Review, ReviewSchema } from './schemas/review.schema';
import { Profile, ProfileSchema } from '../profiles/schemas/profile.schema';
import {
  EmployerProfile,
  EmployerProfileSchema,
} from '../employers/schemas/employer-profile.schema';
import {
  Application,
  ApplicationSchema,
} from '../applications/schemas/application.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';

/**
 * ReviewsModule — Capability 1 (Reviews & Trust Score).
 *
 * Bundles `ReviewsService` (creation, retrieval, admin moderation) and
 * `TrustScoreService` (trust-aggregate calculation/persistence) with the public
 * and admin controllers.
 *
 * Model registrations (Module Wiring Notes):
 *   - `Review`           — primary collection for this module.
 *   - candidate `Profile`— reviewee trust aggregates + no-show basis (CANDIDATE).
 *   - `EmployerProfile`  — reviewee trust aggregates (EMPLOYER) + job ownership
 *                          resolution (Job.employerId → EmployerProfile._id).
 *   - `Application`      — completion guard + candidate/job resolution on create.
 *   - `Job`             — employer/owner context for review direction.
 *   - `User`            — reviewer display-name resolution for list/notify.
 *
 * `AuditModule` is imported to inject `AuditService` for hide/restore audit
 * entries. `TrustScoreService` is **exported** so `ApplicationsModule` can
 * import this module and call `applyNoShowPenalty()` from the no-show flow
 * (task 5.20).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: EmployerProfile.name, schema: EmployerProfileSchema },
      { name: Application.name, schema: ApplicationSchema },
      { name: Job.name, schema: JobSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuditModule,
    // Provides UsersService so the controller-scoped BlockedUserGuard
    // (@UseGuards(..., BlockedUserGuard)) can resolve its UsersService
    // dependency from this module's context (Req 12.7, task 9.2).
    UsersModule,
  ],
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService, TrustScoreService],
  exports: [TrustScoreService],
})
export class ReviewsModule {}
