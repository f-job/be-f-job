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
    UsersModule,
    AuthModule,
    HealthModule,
    CandidatesModule,
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

    // ─── Trust & Safety Modules ──────────────────────────────────────────────
    AuditModule,
    ReviewsModule,
    VerificationModule,
    ReportsModule,
  ],
})
export class AppModule {}
