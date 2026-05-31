import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsController } from './reports.controller';
import { AdminReportsController } from './admin-reports.controller';
import { ReportsService } from './reports.service';
import { Report, ReportSchema } from './schemas/report.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';

/**
 * ReportsModule — Capability 4 (Reporting & Moderation).
 *
 * Registers the `Report` model (primary collection) plus `Job` and `User`,
 * which `ReportsService` needs to verify report targets exist (Req 10.5) and to
 * enforce against them on resolution (Job → closed / User → blocked — Req 11.3,
 * 11.4). Imports `AuditModule` for `AuditService` (audit-log append on
 * resolve/dismiss — Req 15.1).
 *
 * `EventEmitter2` is provided globally by the `EventEmitterModule` configured in
 * the root module, so no explicit import is required for the domain events
 * (`report.created`, `report.resolved`) emitted by `ReportsService`.
 *
 * This module is registered in `app.module.ts` separately (task 9.2).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      // Primary collection for this module
      { name: Report.name, schema: ReportSchema },

      // Required by ReportsService to:
      //   a) verify a target Job exists before persisting a JOB report (Req 10.5)
      //   b) block the target Job (status → closed) on resolution (Req 11.3)
      { name: Job.name, schema: JobSchema },

      // Required by ReportsService to:
      //   c) verify a target User exists before persisting a USER report (Req 10.5)
      //   d) block the target User (status → blocked) on resolution (Req 11.4)
      { name: User.name, schema: UserSchema },
    ]),

    // Provides AuditService (best-effort audit-log append on resolve/dismiss).
    AuditModule,

    // Provides UsersService so the controller-scoped BlockedUserGuard can
    // resolve its dependency from this module's context (Req 12.7, task 9.2).
    UsersModule,
  ],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
