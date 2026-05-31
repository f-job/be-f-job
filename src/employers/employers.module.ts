import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  EmployerProfile,
  EmployerProfileSchema,
} from './schemas/employer-profile.schema';

import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Application,
  ApplicationSchema,
} from '../applications/schemas/application.schema';

import { EmployerController } from './employer.controller';
import { EmployerService } from './employers.service';
import { EmployerCandidatesController } from './employer.candidates.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: EmployerProfile.name,
        schema: EmployerProfileSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: 'CandidateProfile',
        schema: require('../candidates/schemas/candidate-profile.schema')
          .CandidateProfileSchema,
      },
      {
        name: Application.name,
        schema: ApplicationSchema,
      }
    ]),
  ],
  controllers: [EmployerController, EmployerCandidatesController],
  providers: [EmployerService],
  exports: [EmployerService],
})
export class EmployersModule {}