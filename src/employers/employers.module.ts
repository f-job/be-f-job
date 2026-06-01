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
import { EmployerToolsController } from './employer.tools.controller';

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
      },
      {
        name: 'FavoriteCandidate',
        schema: require('./schemas/favorite-candidates.schema').FavoriteCandidateSchema,
      },
      {
        name: 'Interview',
        schema: require('../interviews/schemas/interview.schema').InterviewSchema,
      }
    ]),
  ],
  controllers: [EmployerController, EmployerCandidatesController, EmployerToolsController],
  providers: [EmployerService],
  exports: [EmployerService],
})
export class EmployersModule {}