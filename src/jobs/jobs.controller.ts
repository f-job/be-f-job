import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// ROUTING ORDER NOTICE:
//   Static sub-routes  (/urgent, /recommended, /stats/industry) MUST be declared
//   BEFORE the dynamic /:id route to prevent NestJS from matching literals as
//   ObjectId parameters.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Job Listings')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // ─── 1. GET /jobs ──────────────────────────────────────────────────────────
  // Public — no auth required

  @Get()
  @ApiOperation({
    summary: 'Public active job list with filters & pagination',
    description:
      'Returns a paginated list of all ACTIVE jobs. Supports full-text keyword search, ' +
      'location, district, salary range, level, job type, industry, urgency flag, ' +
      'and three sort modes: newest (default), salary_high, salary_low.',
  })
  @ApiResponse({ status: 200, description: 'Paginated job list returned successfully.' })
  @ApiQuery({ name: 'keyword', required: false, description: 'Full-text search across title, description, company name' })
  @ApiQuery({ name: 'location', required: false, description: 'Province / city (case-insensitive, partial match)' })
  @ApiQuery({ name: 'district', required: false, description: 'District within the city (case-insensitive, partial match)' })
  @ApiQuery({ name: 'salary_min', required: false, type: Number, description: 'Minimum salary (VND)' })
  @ApiQuery({ name: 'salary_max', required: false, type: Number, description: 'Maximum salary (VND)' })
  @ApiQuery({ name: 'level', required: false, description: 'Experience level: Intern | Fresher | Junior | Senior | Manager' })
  @ApiQuery({ name: 'job_type', required: false, description: 'Work arrangement: Onsite | Hybrid | Remote' })
  @ApiQuery({ name: 'industry', required: false, description: 'Industry / field (case-insensitive, partial match)' })
  @ApiQuery({ name: 'is_urgent', required: false, type: Boolean, description: 'Filter urgent jobs only' })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'salary_high', 'salary_low'], description: 'Sort order (default: newest)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(@Query() query: ListJobsQueryDto) {
    return this.jobsService.findPublicJobs(query);
  }

  // ─── 2. GET /jobs/urgent ───────────────────────────────────────────────────
  // Public — no auth required
  // MUST be declared before /:id to avoid collision

  @Get('urgent')
  @ApiOperation({
    summary: 'Urgent / priority active job listings',
    description:
      'Returns the top 20 urgent ACTIVE jobs ordered by pinned status then most recent. ' +
      'These are jobs flagged as is_urgent=true by the employer or Admin.',
  })
  @ApiResponse({ status: 200, description: 'Urgent job list returned successfully.' })
  findUrgent() {
    return this.jobsService.findUrgentJobs();
  }

  // ─── 3. GET /jobs/recommended ──────────────────────────────────────────────
  // Protected — requires CANDIDATE role; uses JWT profile context for matching

  @Get('recommended')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Candidate] Recommended jobs tailored to the current candidate',
    description:
      'Returns up to 10 ACTIVE jobs that best match the candidate\'s industry, ' +
      'skills, and location extracted from the JWT session context. ' +
      'Falls back to the 10 most recent pinned jobs if no profile data is present.',
  })
  @ApiResponse({ status: 200, description: 'Recommended job list returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  findRecommended(@CurrentUser() user: any) {
    // Pass lightweight profile context from the JWT payload.
    // Enrich this with a CandidateProfile lookup once the Profiles module is built.
    const profileContext = {
      industry: user?.industry,
      skills: user?.skills,
      location: user?.location,
    };
    return this.jobsService.findRecommendedJobs(profileContext);
  }

  // ─── 4. GET /jobs/stats/industry ──────────────────────────────────────────
  // Public — no auth required (Admin dashboards may use it too)
  // MUST be declared before /:id to avoid collision

  @Get('stats/industry')
  @ApiOperation({
    summary: 'Job count statistics aggregated by industry (public / Admin)',
    description:
      'Runs a high-performance MongoDB Aggregation Pipeline on the active jobs collection ' +
      'and returns a list of { industry, count } pairs sorted by count descending. ' +
      'Suitable for dashboard pie / bar charts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Industry statistics returned successfully.',
    schema: {
      example: [
        { industry: 'IT', count: 142 },
        { industry: 'Marketing', count: 87 },
        { industry: 'Bán hàng', count: 63 },
      ],
    },
  })
  getIndustryStats() {
    return this.jobsService.getIndustryStats();
  }

  // ─── 5. GET /jobs/:id ──────────────────────────────────────────────────────
  // Public — no auth required
  // Placed AFTER all static routes to avoid routing collisions

  @Get(':id')
  @ApiOperation({
    summary: 'Detailed view of a specific active job',
    description:
      'Returns the full job document for a single ACTIVE job. ' +
      'Each successful request atomically increments the job\'s viewCount field. ' +
      'Returns ERR_4001 if the job does not exist or is not in ACTIVE status.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the job', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'Job detail returned successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Job not found or not active.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.jobsService.findJobById(id);
  }

  // ─── 6. GET /jobs/:id/applications ────────────────────────────────────────
  // Protected — CANDIDATE only; sees their own application for this job

  @Get(':id/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Candidate] List own application(s) for a specific job',
    description:
      'A CANDIDATE can view their own application(s) submitted for this job. ' +
      'Returns ERR_4001 if the job does not exist or is not active.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the job', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Application list returned successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Job not found or not active.' })
  findApplicationsForJob(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.jobsService.findApplicationsForJob(
      id,
      user.id.toString(),
      Number(page),
      Number(limit),
    );
  }
}
