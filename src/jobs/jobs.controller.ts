import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
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
import { ExperienceLevel, CasualJobType } from './schemas/job.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// !! ROUTING ORDER SAFEGUARD !!
//
// Static sub-routes MUST be declared BEFORE the dynamic /:id wildcard.
// NestJS resolves routes in declaration order. Placing a literal like
// "urgent" or "stats/industry" after /:id would cause NestJS to treat
// the literal string as an ObjectId, breaking the route entirely.
//
// Enforced order:
//   1. GET /             → findAll()           (public)
//   2. GET /urgent       → findUrgent()         (public)   ← STATIC — before /:id
//   3. GET /recommended  → findRecommended()    (CANDIDATE)← STATIC — before /:id
//   4. GET /stats/industry → getIndustryStats() (public)   ← STATIC — before /:id
//   5. GET /:id          → findOne()            (public)   ← DYNAMIC wildcard
//   6. GET /:id/applications → findApplicationsForJob()    ← DYNAMIC wildcard
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Job Listings')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // ─── 1. GET /jobs ──────────────────────────────────────────────────────────
  // Public — no authentication required

  @Get()
  @ApiOperation({
    summary: 'Public active casual job list with filters & pagination',
    description:
      'Returns a paginated list of all ACTIVE casual / event / part-time jobs. ' +
      'Supports full-text keyword search, location, district, casual wage range, ' +
      'experience level, job type (Part-time | Event | Seasonal), industry, ' +
      'urgency flag, and three sort modes: newest (default), salary_high, salary_low.',
  })
  @ApiResponse({ status: 200, description: 'Paginated casual job list returned successfully.' })
  @ApiQuery({
    name: 'keyword',
    required: false,
    description: 'Full-text search across job title, description, and company name',
    example: 'phục vụ bàn',
  })
  @ApiQuery({
    name: 'location',
    required: false,
    description: 'Province / city (case-insensitive, partial match)',
    example: 'Hồ Chí Minh',
  })
  @ApiQuery({
    name: 'district',
    required: false,
    description: 'District / ward (case-insensitive, partial match)',
    example: 'Quận 1',
  })
  @ApiQuery({
    name: 'salary_min',
    required: false,
    type: Number,
    description: 'Minimum casual wage (VND). Filters salaryAmount >= salary_min.',
    example: 20000,
  })
  @ApiQuery({
    name: 'salary_max',
    required: false,
    type: Number,
    description: 'Maximum casual wage (VND). Filters salaryAmount <= salary_max.',
    example: 500000,
  })
  @ApiQuery({
    name: 'level',
    required: false,
    enum: ExperienceLevel,
    description: 'Experience requirement: "No Experience" | "< 6 Months" | "> 6 Months"',
    example: ExperienceLevel.NONE,
  })
  @ApiQuery({
    name: 'job_type',
    required: false,
    enum: CasualJobType,
    description: 'Type of casual engagement: "Part-time" | "Event" | "Seasonal"',
    example: CasualJobType.GIG_EVENT,
  })
  @ApiQuery({
    name: 'industry',
    required: false,
    description: 'Industry / sector (case-insensitive, partial match)',
    example: 'F&B',
  })
  @ApiQuery({
    name: 'is_urgent',
    required: false,
    type: Boolean,
    description: 'Filter urgent / hot gigs only (true = urgent only)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['newest', 'salary_high', 'salary_low'],
    description: 'Sort order — default: newest',
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(@Query() query: ListJobsQueryDto) {
    return this.jobsService.findPublicJobs(query);
  }

  // ─── 2. GET /jobs/urgent ───────────────────────────────────────────────────
  // Public — no authentication required
  // STATIC ROUTE: declared before /:id to prevent NestJS routing collision

  @Get('urgent')
  @ApiOperation({
    summary: 'Urgent / hot casual gig listings',
    description:
      'Returns the top 20 urgent ACTIVE casual jobs ordered by pinned status then most recently posted. ' +
      'Urgent gigs are flagged is_urgent=true by the employer (e.g. "cần người ngay tối nay") ' +
      'or promoted by an Admin.',
  })
  @ApiResponse({ status: 200, description: 'Urgent casual job list returned successfully.' })
  findUrgent() {
    return this.jobsService.findUrgentJobs();
  }

  // ─── 3. GET /jobs/recommended ──────────────────────────────────────────────
  // Protected — CANDIDATE role required; uses JWT profile context for matching
  // STATIC ROUTE: declared before /:id to prevent NestJS routing collision

  @Get('recommended')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Candidate] Recommended casual gigs tailored to the current candidate',
    description:
      'Returns up to 10 ACTIVE casual gigs that best match the candidate\'s ' +
      'industry preference, desired benefits (e.g. "Bao cơm", "Tips"), and location. ' +
      'Profile context is extracted from the JWT payload (v1). ' +
      'Falls back to the 10 most recent pinned gigs when no profile data is present.',
  })
  @ApiResponse({ status: 200, description: 'Recommended casual job list returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  findRecommended(@CurrentUser() user: any) {
    // Lightweight profile context sourced from JWT payload.
    // Replace `benefits` and `industry` with a real CandidateProfile lookup
    // once the Profiles module is implemented.
    const profileContext = {
      industry: user?.industry,
      benefits: user?.benefits as string[] | undefined,
      location: user?.location,
    };
    return this.jobsService.findRecommendedJobs(profileContext);
  }

  // ─── 4. GET /jobs/stats/industry ──────────────────────────────────────────
  // Public — no authentication required (also used by Admin dashboards)
  // STATIC ROUTE: declared before /:id to prevent NestJS routing collision

  @Get('stats/industry')
  @ApiOperation({
    summary: 'Casual job count statistics aggregated by industry (public / Admin)',
    description:
      'Runs a high-performance MongoDB Aggregation Pipeline on the active jobs collection ' +
      'and returns a sorted list of { industry, count } pairs. ' +
      'Reflects the casual job marketplace sectors (e.g. F&B, Sự kiện, Giao hàng, Bán lẻ). ' +
      'Suitable for Admin dashboard pie / bar charts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Industry statistics returned successfully.',
    schema: {
      example: [
        { industry: 'F&B',       count: 187 },
        { industry: 'Sự kiện',   count: 134 },
        { industry: 'Giao hàng', count: 98  },
        { industry: 'Bán lẻ',   count: 74  },
      ],
    },
  })
  getIndustryStats() {
    return this.jobsService.getIndustryStats();
  }

  // ─── 5. GET /jobs/:id ──────────────────────────────────────────────────────
  // Public — no authentication required
  // DYNAMIC ROUTE: placed AFTER all static routes — do not move above them

  @Get(':id')
  @ApiOperation({
    summary: 'Detailed view of a specific active casual job',
    description:
      'Returns the full document for a single ACTIVE casual job including ' +
      'salaryType, salaryAmount, workingTimeText, benefits, and shift details. ' +
      'Each successful request atomically increments the job\'s viewCount. ' +
      'Returns ERR_4001 if the job is not found or is not in ACTIVE status.',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the casual job',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Casual job detail returned successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Job not found or not active.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.jobsService.findJobById(id);
  }

  // ─── 6. GET /jobs/:id/applications ────────────────────────────────────────
  // Protected — CANDIDATE role required; candidate sees only their own applications
  // DYNAMIC ROUTE: placed AFTER all static routes — do not move above them

  @Get(':id/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CANDIDATE)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Candidate] List own application(s) for a specific casual job',
    description:
      'A CANDIDATE can view only their own application(s) submitted for this gig. ' +
      'Returns ERR_4001 if the job does not exist or is not active. ' +
      'Returns an empty stub until the ApplicationsModule is implemented.',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the casual job',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Application list returned successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Job not found or not active.' })
  findApplicationsForJob(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
    @Query('page')  page  = 1,
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
