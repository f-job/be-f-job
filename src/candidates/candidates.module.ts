import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CandidatesService } from './candidates.service';
import { CandidatesController } from './candidates.controller';
import { CandidateProfile, CandidateProfileSchema } from './schemas/candidate-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CandidateProfile.name, schema: CandidateProfileSchema },
      // Needed by CandidatesService for transaction-level delete + existence checks
      { name: User.name, schema: UserSchema },
    ]),
    // Import UsersModule to inject UsersService into CandidatesController (block/unblock)
    UsersModule,
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
