import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import {
  IndustriesController,
  LocationsController,
  SkillsController,
  LevelsController,
  JobTypesController,
} from './metadata.controller';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import {
  CandidateProfile,
  CandidateProfileSchema,
} from '../candidates/schemas/candidate-profile.schema';

@Module({
  imports: [
    // Register both models directly — avoids circular cross-module imports.
    // JobsModule and CandidatesModule each export their services; SearchModule
    // only needs raw Mongoose models for its own query logic, so registering
    // the schemas here is the correct NestJS pattern for cross-domain reads.
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: CandidateProfile.name, schema: CandidateProfileSchema },
    ]),
  ],
  controllers: [
    // ── Search routes: /search/jobs, /search/candidates, /search/suggestions
    SearchController,

    // ── Metadata routes: /industries, /locations, /skills, /levels, /job-types
    IndustriesController,
    LocationsController,
    SkillsController,
    LevelsController,
    JobTypesController,
  ],
  providers: [SearchService],
  // SearchService is not exported — it is self-contained within this module.
  // If another module needs industry/province lookups, they should inject
  // the constants directly from master-data.constants.ts.
})
export class SearchModule {}
