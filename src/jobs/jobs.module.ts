import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { Job, JobSchema } from './schemas/job.schema';
import { EmployerJobsController } from './employer-jobs.controller';
import { EmployerJobsService } from './employer-jobs.service';
import { AdminJobsController } from './admin-jobs.controller';
import { AdminJobsService } from './admin-jobs.service';
import { EmployerProfile, EmployerProfileSchema } from '../employers/schemas/employer-profile.schema';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';
import { CandidateProfile, CandidateProfileSchema } from '../candidates/schemas/candidate-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: 'EmployerProfile', schema: EmployerProfileSchema },
      { name: Application.name, schema: ApplicationSchema },
      { name: CandidateProfile.name, schema: CandidateProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [JobsController, EmployerJobsController, AdminJobsController],
  providers: [JobsService, EmployerJobsService, AdminJobsService],
  exports: [JobsService, EmployerJobsService, AdminJobsService],
})
export class JobsModule { }
