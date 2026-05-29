import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchJobsQueryDto } from './dto/search-jobs-query.dto';
import { SearchCandidatesQueryDto } from './dto/search-candidates-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ExperienceLevel, CasualJobType } from '../jobs/schemas/job.schema';

// ─────────────────────────────────────────────────────────────────────────────
// !! ROUTING ORDER SAFEGUARD !!
//
// This controller handles only the three /search/* routes:
//   1. GET /search/jobs         → public
//   2. GET /search/candidates   → EMPLOYER | ADMIN
//   3. GET /search/suggestions  → public
//
// All routes use distinct literal path segments — no dynamic :param collision.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // ─── 1. GET /search/jobs ───────────────────────────────────────────────────
  // Public — no authentication required.

  @Get('jobs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Advanced casual job vacancy search (Public)',
    description:
      'Searches ACTIVE casual / event / part-time job listings with combined ' +
      'filter support: keyword (MongoDB $text index on title + companyName), ' +
      'companyName regex, province (city), district, industry, experience level, ' +
      'job type (Part-time | Event | Seasonal), salary range (VND), urgency flag, ' +
      'and three sort modes: newest (default), salary_high, salary_low. ' +
      'Returns a paginated result envelope with total / page / limit / totalPages metadata.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated casual job search results returned successfully.',
    schema: {
      example: {
        data: [
          {
            _id: '665f1a2b3c4d5e6f7a8b9c0d',
            title: 'Phục vụ bàn cuối tuần',
            companyName: 'Highlands Coffee',
            location: 'Hồ Chí Minh',
            district: 'Quận 1',
            industry: 'F&B',
            jobType: 'Part-time',
            level: 'No Experience',
            salaryType: 'hourly',
            salaryAmount: 28000,
            isUrgent: false,
          },
        ],
        meta: { total: 124, page: 1, limit: 10, totalPages: 13 },
      },
    },
  })
  @ApiQuery({ name: 'keyword',     required: false, description: 'Full-text keyword across title & companyName', example: 'phục vụ' })
  @ApiQuery({ name: 'companyName', required: false, description: 'Employer company name (partial, case-insensitive)', example: 'Highlands' })
  @ApiQuery({ name: 'province',    required: false, description: 'Province / city (e.g. "Hồ Chí Minh")', example: 'Hồ Chí Minh' })
  @ApiQuery({ name: 'district',    required: false, description: 'District / ward (e.g. "Quận 1")', example: 'Quận 1' })
  @ApiQuery({ name: 'industry',    required: false, description: 'Industry sector (partial match, e.g. "F&B")', example: 'F&B' })
  @ApiQuery({ name: 'level',       required: false, enum: ExperienceLevel, description: 'Experience requirement' })
  @ApiQuery({ name: 'jobType',     required: false, enum: CasualJobType,   description: 'Casual engagement type' })
  @ApiQuery({ name: 'salary_min',  required: false, type: Number, description: 'Min casual wage (VND)', example: 20000 })
  @ApiQuery({ name: 'salary_max',  required: false, type: Number, description: 'Max casual wage (VND)', example: 500000 })
  @ApiQuery({ name: 'is_urgent',   required: false, type: Boolean, description: 'Urgent gigs only' })
  @ApiQuery({ name: 'sort',        required: false, enum: ['newest', 'salary_high', 'salary_low'], description: 'Sort order' })
  @ApiQuery({ name: 'page',        required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit',       required: false, type: Number, example: 10 })
  searchJobs(@Query() query: SearchJobsQueryDto) {
    return this.searchService.searchJobs(query);
  }

  // ─── 2. GET /search/candidates ─────────────────────────────────────────────
  // Protected — EMPLOYER or ADMIN role required.

  @Get('candidates')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Employer / Admin] Search candidate profiles by skills, location, and bio summary',
    description:
      'Restricted to EMPLOYER and ADMIN roles. ' +
      'Searches CandidateProfile documents using a dynamic filter: ' +
      'skills (comma-separated → $in match against candidate skill set), ' +
      'province (regex on candidate address), summary (regex on candidate bio), ' +
      'and openToWork boolean gate. ' +
      'Returns paginated CandidateProfile documents ordered by openToWork desc, then updatedAt desc.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated candidate search results returned successfully.',
    schema: {
      example: {
        data: [
          {
            _id: '665f1a2b3c4d5e6f7a8b9c01',
            userId: '665f1a2b3c4d5e6f7a8b9c02',
            fullName: 'Nguyễn Văn An',
            address: 'Quận 1, Hồ Chí Minh',
            skills: ['Pha chế', 'Phục vụ bàn'],
            bio: 'Có 1 năm kinh nghiệm pha chế trà sữa tại The Alley.',
            openToWork: true,
          },
        ],
        meta: { total: 38, page: 1, limit: 10, totalPages: 4 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller is not EMPLOYER or ADMIN.' })
  @ApiQuery({ name: 'skills',     required: false, description: 'CSV skill names (e.g. "Pha chế,Phục vụ")', example: 'Pha chế,Phục vụ' })
  @ApiQuery({ name: 'province',   required: false, description: 'Province / city filter on candidate address', example: 'Hồ Chí Minh' })
  @ApiQuery({ name: 'summary',    required: false, description: 'Bio context keyword (regex on bio field)', example: 'trà sữa' })
  @ApiQuery({ name: 'openToWork', required: false, type: Boolean, description: 'Filter to actively-seeking candidates only' })
  @ApiQuery({ name: 'page',       required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit',      required: false, type: Number, example: 10 })
  searchCandidates(@Query() query: SearchCandidatesQueryDto) {
    return this.searchService.searchCandidates(query);
  }

  // ─── 3. GET /search/suggestions ────────────────────────────────────────────
  // Public — no authentication required.

  @Get('suggestions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Auto-suggestion keywords for the search bar (Public)',
    description:
      'Returns up to 10 deduplicated keyword suggestions derived from ACTIVE job titles ' +
      'and industry names using a MongoDB aggregation pipeline. ' +
      'Pass an optional `q` prefix to narrow suggestions (e.g. q="phục" → "Phục vụ bàn"). ' +
      'Suitable for real-time search-bar autocomplete dropdowns.',
  })
  @ApiResponse({
    status: 200,
    description: 'Auto-suggestion list returned successfully.',
    schema: {
      example: ['F&B', 'Giao hàng', 'Phục vụ bàn', 'Phục vụ tiệc', 'PG/PB sự kiện'],
    },
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Optional prefix to narrow keyword suggestions (case-insensitive)',
    example: 'phục',
  })
  getSuggestions(@Query('q') q?: string) {
    return this.searchService.getSuggestions(q);
  }
}
