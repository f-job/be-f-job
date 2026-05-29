import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { SearchService } from './search.service';

// ─────────────────────────────────────────────────────────────────────────────
// metadata.controller.ts
//
// Five isolated controllers — one per resource prefix — to guarantee route
// isolation and prevent any /:id wildcard collision with static sub-paths.
//
// Controller prefix map:
//   IndustriesController  → @Controller('industries')
//   LocationsController   → @Controller('locations')
//   SkillsController      → @Controller('skills')
//   LevelsController      → @Controller('levels')
//   JobTypesController    → @Controller('job-types')
//
// Within IndustriesController the route ordering strictly follows:
//   1. GET /                    (static  — list all)
//   2. GET /:id/jobs            (dynamic — must declare BEFORE /:id to avoid
//                                sub-path being swallowed by the bare /:id handler)
//   3. GET /:id                 (dynamic — catch-all, declared LAST)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Industries Controller ─────────────────────────────────────────────────

@ApiTags('Metadata — Industries')
@Controller('industries')
export class IndustriesController {
  constructor(private readonly searchService: SearchService) {}

  // ── 1. GET /industries ────────────────────────────────────────────────────
  // Static root path — declared first; no collision risk.

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all industry categories (Public)',
    description:
      'Returns the full list of Vietnamese casual labour market industry categories ' +
      'from in-memory master data (zero DB cost). ' +
      'Each entry includes id, name, slug, icon emoji, and description. ' +
      'Use the returned `id` to call GET /industries/:id/jobs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Industry list returned successfully.',
    schema: {
      example: [
        { id: 'fnb',      name: 'F&B',      slug: 'fnb',   icon: '🍜', description: 'Nhà hàng, quán cà phê...' },
        { id: 'event',    name: 'Sự kiện',  slug: 'event', icon: '🎪', description: 'Tổ chức sự kiện...' },
        { id: 'delivery', name: 'Giao hàng',slug: 'delivery',icon: '🛵',description: 'Giao hàng nhanh...' },
      ],
    },
  })
  getAllIndustries() {
    return this.searchService.getAllIndustries();
  }

  // ── 2. GET /industries/:id/jobs ───────────────────────────────────────────
  // CRITICAL: Declared BEFORE GET /:id so NestJS does not consume "jobs"
  // as an /:id parameter value. Sub-path /:id/jobs must precede bare /:id.

  @Get(':id/jobs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paginated ACTIVE job listings for a specific industry (Public)',
    description:
      'Returns a paginated list of ACTIVE jobs whose `industry` field matches ' +
      'the requested industry name (case-insensitive regex). ' +
      'Results are sorted: isPinned desc → isUrgent desc → createdAt desc. ' +
      'Throws ERR_4001 if the industry ID is not recognised.',
  })
  @ApiParam({
    name: 'id',
    description: 'Industry slug ID from GET /industries (e.g. "fnb", "event", "delivery")',
    example: 'fnb',
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Paginated job list for the specified industry returned successfully.',
    schema: {
      example: {
        industry: { id: 'fnb', name: 'F&B', slug: 'fnb', icon: '🍜' },
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Industry ID not found.' })
  getJobsByIndustry(
    @Param('id') id: string,
    @Query('page')  page  = 1,
    @Query('limit') limit = 10,
  ) {
    return this.searchService.getJobsByIndustry(id, Number(page), Number(limit));
  }

  // ── 3. GET /industries/:id ────────────────────────────────────────────────
  // DYNAMIC — declared LAST within this controller to prevent collision
  // with the static /:id/jobs sub-path declared above.

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Single industry detail (Public)',
    description:
      'Returns the full definition of a single industry category by its slug-style ID. ' +
      'Throws ERR_4001 if the ID is not recognised.',
  })
  @ApiParam({
    name: 'id',
    description: 'Industry slug ID (e.g. "fnb", "event", "delivery", "warehouse")',
    example: 'event',
  })
  @ApiResponse({
    status: 200,
    description: 'Industry detail returned successfully.',
    schema: {
      example: {
        id: 'event',
        name: 'Sự kiện',
        slug: 'event',
        icon: '🎪',
        description: 'Tổ chức sự kiện, hội nghị, triển lãm, tiệc cưới và lễ hội',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Industry ID not found.' })
  getIndustryById(@Param('id') id: string) {
    return this.searchService.getIndustryById(id);
  }
}

// ─── Locations Controller ──────────────────────────────────────────────────

@ApiTags('Metadata — Locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly searchService: SearchService) {}

  // ── GET /locations/provinces ───────────────────────────────────────────────
  // CRITICAL: Static path "provinces" declared BEFORE /:provinceId so that
  // NestJS does not capture "provinces" as a dynamic :provinceId parameter.

  @Get('provinces')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all Vietnamese provinces / cities (Public)',
    description:
      'Returns the complete list of provinces relevant to the F-Job casual labour market ' +
      '(Ho Chi Minh, Hanoi, Da Nang, and more) from in-memory master data (zero DB cost). ' +
      'District arrays are omitted for a lightweight response — use GET /locations/:provinceId/districts ' +
      'to fetch districts for a specific province.',
  })
  @ApiResponse({
    status: 200,
    description: 'Province list returned successfully.',
    schema: {
      example: [
        { id: 'hcm',    name: 'Hồ Chí Minh', slug: 'ho-chi-minh', region: 'south' },
        { id: 'hanoi',  name: 'Hà Nội',       slug: 'ha-noi',      region: 'north' },
        { id: 'danang', name: 'Đà Nẵng',      slug: 'da-nang',     region: 'central' },
      ],
    },
  })
  getAllProvinces() {
    return this.searchService.getAllProvinces();
  }

  // ── GET /locations/:provinceId/districts ───────────────────────────────────
  // Dynamic with sub-path — placed after the static "provinces" route above.

  @Get(':provinceId/districts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'District list for a specific province (Public)',
    description:
      'Returns the full list of districts / wards for the given province ID. ' +
      'Throws ERR_4001 if the province ID is not recognised. ' +
      'Use the district `name` values as the `district` filter in GET /search/jobs.',
  })
  @ApiParam({
    name: 'provinceId',
    description: 'Province ID from GET /locations/provinces (e.g. "hcm", "hanoi", "danang")',
    example: 'hcm',
  })
  @ApiResponse({
    status: 200,
    description: 'District list for the specified province returned successfully.',
    schema: {
      example: {
        province: { id: 'hcm', name: 'Hồ Chí Minh', slug: 'ho-chi-minh', region: 'south' },
        districts: [
          { id: 'hcm-q1',  name: 'Quận 1'     },
          { id: 'hcm-q3',  name: 'Quận 3'     },
          { id: 'hcm-q7',  name: 'Quận 7'     },
          { id: 'hcm-bt',  name: 'Bình Tân'   },
          { id: 'hcm-tp',  name: 'Thủ Đức'    },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Province ID not found.' })
  getDistrictsByProvince(@Param('provinceId') provinceId: string) {
    return this.searchService.getDistrictsByProvince(provinceId);
  }
}

// ─── Skills Controller ─────────────────────────────────────────────────────

@ApiTags('Metadata — Skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly searchService: SearchService) {}

  // ── GET /skills ────────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all candidate skill definitions (Public)',
    description:
      'Returns the full catalogue of skills relevant to the Vietnamese casual labour market ' +
      '(F&B, Event, Delivery, Warehouse, Retail, etc.) from in-memory master data. ' +
      'Each entry includes an ID, display name, and category grouping. ' +
      'Use the `name` values as input to GET /search/candidates?skills=...',
  })
  @ApiResponse({
    status: 200,
    description: 'Skill list returned successfully.',
    schema: {
      example: [
        { id: 'pha-che',  name: 'Pha chế',       category: 'F&B'      },
        { id: 'phuc-vu',  name: 'Phục vụ bàn',   category: 'F&B'      },
        { id: 'pg-pb',    name: 'PG/PB',          category: 'Sự kiện'  },
        { id: 'boc-xep',  name: 'Bốc xếp hàng',  category: 'Kho vận'  },
        { id: 'lai-xe-may',name: 'Lái xe máy',   category: 'Giao hàng'},
      ],
    },
  })
  getAllSkills() {
    return this.searchService.getAllSkills();
  }
}

// ─── Levels Controller ─────────────────────────────────────────────────────

@ApiTags('Metadata — Levels')
@Controller('levels')
export class LevelsController {
  constructor(private readonly searchService: SearchService) {}

  // ── GET /levels ────────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all experience level definitions (Public)',
    description:
      'Returns the three experience levels used in casual job postings, derived from ' +
      'the ExperienceLevel enum in the Job schema: ' +
      '"No Experience" | "< 6 Months" | "> 6 Months". ' +
      'Use the `value` field as the `level` filter in GET /search/jobs?level=...',
  })
  @ApiResponse({
    status: 200,
    description: 'Experience level list returned successfully.',
    schema: {
      example: [
        { id: 'none',     value: 'No Experience', label: 'Không yêu cầu kinh nghiệm'   },
        { id: 'under-6m', value: '< 6 Months',    label: 'Dưới 6 tháng kinh nghiệm'    },
        { id: 'above-6m', value: '> 6 Months',    label: 'Trên 6 tháng kinh nghiệm'    },
      ],
    },
  })
  getAllLevels() {
    return this.searchService.getAllLevels();
  }
}

// ─── Job Types Controller ──────────────────────────────────────────────────

@ApiTags('Metadata — Job Types')
@Controller('job-types')
export class JobTypesController {
  constructor(private readonly searchService: SearchService) {}

  // ── GET /job-types ────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all casual job type definitions (Public)',
    description:
      'Returns the three engagement types used in casual job postings, derived from ' +
      'the CasualJobType enum in the Job schema: ' +
      '"Part-time" | "Event" | "Seasonal". ' +
      'Use the `value` field as the `jobType` filter in GET /search/jobs?jobType=...',
  })
  @ApiResponse({
    status: 200,
    description: 'Job type list returned successfully.',
    schema: {
      example: [
        { id: 'part-time', value: 'Part-time', label: 'Bán thời gian'     },
        { id: 'event',     value: 'Event',     label: 'Sự kiện / Gig'     },
        { id: 'seasonal',  value: 'Seasonal',  label: 'Thời vụ / Theo mùa'},
      ],
    },
  })
  getAllJobTypes() {
    return this.searchService.getAllJobTypes();
  }
}
