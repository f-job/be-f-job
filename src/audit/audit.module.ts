import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { UsersModule } from '../users/users.module';

/**
 * AuditModule — leaf dependency providing the append-only audit trail.
 *
 * Registers the `AuditLog` model and **exports** `AuditService` so the
 * Applications, Reviews, Verification, and Reports modules can import this
 * module and inject `AuditService` to record trust-and-safety actions
 * (Sequencing / Dependencies; Module Wiring Notes; Req 15.1, 15.2, 15.3).
 *
 * The admin read controller (`GET /admin/audit-logs`) is added in task 1.3.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
    // Provides UsersService so the controller-scoped BlockedUserGuard on
    // AuditController can resolve its dependency from this module's context
    // (Req 12.7, task 9.2).
    UsersModule,
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
