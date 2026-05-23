import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CandidatesService } from './candidates.service';
import { CandidateProfile, CandidateProfileSchema } from './schemas/candidate-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CandidateProfile.name, schema: CandidateProfileSchema },
    ]),
  ],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
