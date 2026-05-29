import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  EmployerProfile,
  EmployerProfileSchema,
} from './schemas/employer-profile.schema';

import { User, UserSchema } from '../users/schemas/user.schema';

import { EmployerController } from './employer.controller';
import { EmployerService } from './employers.service';

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
    ]),
  ],
  controllers: [EmployerController],
  providers: [EmployerService],
  exports: [EmployerService],
})
export class EmployersModule {}