import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Interview,
  InterviewSchema,
} from './schemas/interview.schema';

import {
  Application,
  ApplicationSchema,
} from '../applications/schemas/application.schema';

import {
  EmployerProfile,
  EmployerProfileSchema,
} from '../employers/schemas/employer-profile.schema';

import {
  Job,
  JobSchema,
} from '../jobs/schemas/job.schema';

import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Interview.name,
        schema: InterviewSchema,
      },
      {
        name: Application.name,
        schema: ApplicationSchema,
      },
      {
        name: EmployerProfile.name,
        schema: EmployerProfileSchema,
      },
      {
        name: Job.name,
        schema: JobSchema,
      },
    ]),
  ],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}