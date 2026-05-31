import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { VerificationController } from './verification.controller';
import { AdminVerificationController } from './admin-verification.controller';
import { VerificationService } from './verification.service';

import { Profile, ProfileSchema } from '../profiles/schemas/profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  EmployerProfile,
  EmployerProfileSchema,
} from '../employers/schemas/employer-profile.schema';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';

/**
 * VerificationModule — Capability 3 (Candidate Identity Verification).
 *
 * Bundles `VerificationService` (candidate submission + self-read; admin queue,
 * document read, approve/reject) with the candidate and admin controllers.
 *
 * Model registrations (Module Wiring Notes):
 *   - candidate `Profile` — owns `verificationStatus`, the embedded
 *     `identityDocuments`, and the decision metadata; the primary collection
 *     this module reads and writes.
 *   - `User`             — registered for verified-badge / requester resolution
 *     alongside the candidate profile (Design → Capability 3 touches `users`).
 *   - `EmployerProfile`  — registered so badge composition can consider the
 *     employer-approval state for users holding both profiles (Req 9.3).
 *
 * `AuditModule` is imported to inject `AuditService` for the approve/reject
 * audit entries (Req 15.1). `EventEmitter2` is provided globally by the
 * app-level `EventEmitterModule`, so it does not need importing here.
 *
 * This module is registered into `app.module.ts` separately in task 9.2.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Profile.name, schema: ProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: EmployerProfile.name, schema: EmployerProfileSchema },
    ]),
    AuditModule,
    // Provides UsersService so the controller-scoped BlockedUserGuard can
    // resolve its dependency from this module's context (Req 12.7, task 9.2).
    UsersModule,
  ],
  controllers: [VerificationController, AdminVerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
