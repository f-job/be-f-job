import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      // Primary collection for this module
      { name: Application.name, schema: ApplicationSchema },

      // Required by ApplicationsService to:
      //   a) verify job existence before applying (Guard 2 in apply())
      //   b) increment / decrement Job.applicationCount side effects
      { name: Job.name, schema: JobSchema },
    ]),
  ],
  controllers: [ApplicationsController],
  providers:   [ApplicationsService],
  exports:     [ApplicationsService],
})
export class ApplicationsModule {}
