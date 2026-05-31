import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApplicationsController } from './applications.controller';
import { EmployerApplicationsController } from './employer-applications.controller';
import { ApplicationsService } from './applications.service';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  EmployerProfile,
  EmployerProfileSchema,
} from '../employers/schemas/employer-profile.schema';
import { AuditModule } from '../audit/audit.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      // Primary collection for this module
      { name: Application.name, schema: ApplicationSchema },

      // Required by ApplicationsService to:
      //   a) verify job existence before applying (Guard 2 in apply())
      //   b) increment / decrement Job.applicationCount side effects
      //   c) populate job.employerId for the application.created event emit
      { name: Job.name, schema: JobSchema },

      // Required by ApplicationsService to:
      //   d) resolve candidate's fullName for the notification email body
      { name: User.name, schema: UserSchema },

      // Required by ApplicationsService to:
      //   e) resolve the caller's EmployerProfile for ownership checks on the
      //      complete / no-show lifecycle transitions (markCompleted/markNoShow)
      { name: EmployerProfile.name, schema: EmployerProfileSchema },
    ]),

    // Provides AuditService (best-effort audit-log append on lifecycle changes)
    AuditModule,

    // Provides TrustScoreService (exported by ReviewsModule) so markNoShow can
    // apply the No_Show_Penalty to the candidate's Trust Score (task 5.20).
    // ReviewsModule only registers models + AuditModule and does NOT import
    // ApplicationsModule, so this direct import creates no circular dependency.
    ReviewsModule,

    // Provides UsersService so the controller-scoped BlockedUserGuard on
    // EmployerApplicationsController can resolve its dependency from this
    // module's context (Req 12.7, task 9.2).
    UsersModule,
  ],
  controllers: [ApplicationsController, EmployerApplicationsController],
  providers:   [ApplicationsService],
  exports:     [ApplicationsService],
})
export class ApplicationsModule {}
