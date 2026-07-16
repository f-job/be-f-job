import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { CandidatesModule } from './candidates/candidates.module';
import { EmployersModule } from './employers/employers.module';
import { JobsModule } from './jobs/jobs.module';
import { ApplicationsModule } from './applications/applications.module';
import { ProfilesModule } from './profiles/profiles.module';
import { SearchModule } from './search/search.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReferralsModule }     from './referrals/referrals.module';
import { PayoutsModule }       from './payouts/payouts.module';
import { ChatModule }          from './chat/chat.module';
import { PackagesModule }      from './packages/packages.module';
import { AuditModule }         from './audit/audit.module';
import { ReviewsModule }       from './reviews/reviews.module';
import { VerificationModule }  from './verification/verification.module';
import { ReportsModule }       from './reports/reports.module';
import { InterviewsModule }    from './interviews/interviews.module';
import { EmailModule }         from './email/email.module';
import { PaymentsModule }      from './payments/payments.module';
import { DashboardModule }     from './dashboard/dashboard.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config';
import { configValidationSchema } from './config/config.validation';


@Module({
  imports: [
    // ─── Config ─────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, jwtConfig, mailConfig],
      validationSchema: configValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false, // Report all missing vars at once
      },
    }),

    // ─── Event Emitter (global — enables @OnEvent() across all modules) ──────
    EventEmitterModule.forRoot({
      // Use wildcards so listeners can subscribe to 'application.*'
      wildcard: false,
      // Max listener count per event (prevents memory leak warnings)
      maxListeners: 20,
    }),

    // ─── Rate Limiting ───────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // ─── Database ────────────────────────────────────────────────────────────
    DatabaseModule,

    // ─── Feature Modules ─────────────────────────────────────────────────────
    // NOTE: CandidatesModule MUST be registered before UsersModule so that the
    // static route `GET /users/candidates` is matched before the dynamic
    // `GET /users/:id` wildcard in UsersController. Otherwise NestJS/Express
    // captures "candidates" as an :id and UsersService.findById throws a
    // CastError ("Cast to ObjectId failed for value 'candidates'").
    CandidatesModule,
    UsersModule,
    AuthModule,
    HealthModule,
    EmployersModule,
    JobsModule,
    ApplicationsModule,
    ProfilesModule,
    SearchModule,
    NotificationsModule,
    ReferralsModule,
    PayoutsModule,
    ChatModule,
    PackagesModule,
    PaymentsModule,

    // ─── Trust & Safety Modules ──────────────────────────────────────────────
    AuditModule,
    ReviewsModule,
    VerificationModule,
    ReportsModule,
    InterviewsModule,

    // ─── Email Module ────────────────────────────────────────────────────────
    EmailModule,

    // ─── Dashboard Module ────────────────────────────────────────────────────
    DashboardModule,
  ],
})
export class AppModule {}
