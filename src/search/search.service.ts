import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, SortOrder } from 'mongoose';
import { Job, JobDocument, JobStatus } from '../jobs/schemas/job.schema';
import {
  CandidateProfile,
  CandidateProfileDocument,
} from '../candidates/schemas/candidate-profile.schema';
import { SearchJobsQueryDto } from './dto/search-jobs-query.dto';
import { SearchCandidatesQueryDto } from './dto/search-candidates-query.dto';
import {
  INDUSTRIES,
  PROVINCES,
  SKILLS,
  LEVELS,
  JOB_TYPES,
  Industry,
  Province,
  District,
  Skill,
  Level,
  JobType,
} from './constants/master-data.constants';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,

    @InjectModel(CandidateProfile.name)
    private readonly candidateProfileModel: Model<CandidateProfileDocument>,
  ) {}

  // ─── GET /search/jobs ──────────────────────────────────────────────────────

  /**
   * Advanced casual job search with a fully dynamic Mongoose FilterQuery.
   *
   * Filter build strategy:
   *   - keyword     → $text search (uses compound text index on title+companyName)
   *   - companyName → $regex on `companyName` (independent of keyword)
   *   - province    → $regex on `location`    (partial, case-insensitive)
   *   - district    → $regex on `district`    (partial, case-insensitive)
   *   - industry    → $regex on `industry`    (partial, case-insensitive)
   *   - jobType     → exact enum match on `jobType`
   *   - level       → exact enum match on `level`
   *   - salary_min/max → $gte/$lte on flat `salaryAmount` scalar
   *   - is_urgent   → boolean exact match
   *
   * Sort modes: newest (default) | salary_high | salary_low.
   * Pagination defaults: page = 1, limit = 10.
   */
  async searchJobs(query: SearchJobsQueryDto) {
    const {
      keyword,
      companyName,
      province,
      district,
      industry,
      level,
      jobType,
      salary_min,
      salary_max,
      is_urgent,
      sort = 'newest',
      page  = 1,
      limit = 10,
    } = query;

    const skip = (page - 1) * limit;

    // ── Build filter ──────────────────────────────────────────────────────────
    const filter: FilterQuery<JobDocument> = { status: JobStatus.ACTIVE };

    // Full-text index search — covers title + companyName compound index
    if (keyword) {
      filter['$text'] = { $search: keyword };
    }

    // Employer company name — independent regex, allows employer-specific browsing
    if (companyName) {
      filter['companyName'] = { $regex: companyName, $options: 'i' };
    }

    // Province / city — regex against the `location` field
    if (province) {
      filter['location'] = { $regex: province, $options: 'i' };
    }

    // District / ward — regex against the `district` field
    if (district) {
      filter['district'] = { $regex: district, $options: 'i' };
    }

    // Industry sector — regex to allow partial match (e.g. "F&B" vs "F&B - Coffee")
    if (industry) {
      filter['industry'] = { $regex: industry, $options: 'i' };
    }

    // Experience level — exact enum value match
    if (level) {
      filter['level'] = level;
    }

    // Casual job type — exact enum value match
    if (jobType) {
      filter['jobType'] = jobType;
    }

    // Salary range — both bounds can coexist on the flat salaryAmount scalar
    if (salary_min !== undefined || salary_max !== undefined) {
      const salaryFilter: Record<string, number> = {};
      if (salary_min !== undefined) salaryFilter['$gte'] = salary_min;
      if (salary_max !== undefined) salaryFilter['$lte'] = salary_max;
      filter['salaryAmount'] = salaryFilter;
    }

    // Urgency flag
    if (is_urgent !== undefined) {
      filter['isUrgent'] = is_urgent;
    }

    // ── Build sort ────────────────────────────────────────────────────────────
    // isPinned surfaces promoted listings at the top within any sort order.
    let sortOptions: Record<string, SortOrder>;
    switch (sort) {
      case 'salary_high':
        sortOptions = { isPinned: -1, salaryAmount: -1 };
        break;
      case 'salary_low':
        sortOptions = { isPinned: -1, salaryAmount: 1 };
        break;
      case 'newest':
      default:
        sortOptions = { isPinned: -1, createdAt: -1 };
    }

    // ── Execute ───────────────────────────────────────────────────────────────
    const [data, total] = await Promise.all([
      this.jobModel
        .find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.jobModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── GET /search/candidates ────────────────────────────────────────────────

  /**
   * Employer / Admin candidate search with dynamic FilterQuery on CandidateProfile.
   *
   * Filter build strategy:
   *   - skills    → CSV string parsed → string[] → $in array match on `skills` field
   *   - province  → $regex on `address` (candidate's stored location)
   *   - summary   → $regex on `bio` (self-introduction context)
   *   - openToWork → boolean exact match (only returns actively seeking candidates)
   *
   * Returns paginated CandidateProfile documents only (no cross-User join for perf).
   * The caller (EMPLOYER/ADMIN) can use the returned `userId` to fetch user details.
   */
  async searchCandidates(query: SearchCandidatesQueryDto) {
    const {
      skills,
      province,
      summary,
      openToWork,
      page  = 1,
      limit = 10,
    } = query;

    const skip = (page - 1) * limit;

    // ── Build filter ──────────────────────────────────────────────────────────
    const filter: FilterQuery<CandidateProfileDocument> = {};

    // Skills — CSV → array → $in match against the candidate's skills array
    if (skills) {
      const skillList = skills
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (skillList.length > 0) {
        filter['skills'] = { $in: skillList };
      }
    }

    // Province / location — regex against address field
    if (province) {
      filter['address'] = { $regex: province, $options: 'i' };
    }

    // Summary / bio context — regex against bio self-introduction
    if (summary) {
      filter['bio'] = { $regex: summary, $options: 'i' };
    }

    // Open to work — boolean gate; default returns all (including non-open)
    if (openToWork !== undefined) {
      filter['openToWork'] = openToWork;
    }

    // ── Execute ───────────────────────────────────────────────────────────────
    const [data, total] = await Promise.all([
      this.candidateProfileModel
        .find(filter)
        .select('-phone -resumeUrl -files')
        .sort({ openToWork: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.candidateProfileModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── GET /search/suggestions ───────────────────────────────────────────────

  /**
   * Auto-suggestion keyword pipeline for the search bar.
   *
   * Aggregation pipeline stages:
   *   1. $match  — only ACTIVE jobs; applies the text prefix if provided.
   *   2. $project — extract title and industry as candidate suggestion strings.
   *   3. $group  — deduplicate the suggestion values.
   *   4. $sort   — alphabetical for predictable UX.
   *   5. $limit  — cap at 10 suggestions.
   *
   * Returns a flat string[] of deduplicated suggestion labels.
   *
   * @param q  Optional prefix to narrow suggestions (e.g. "phục" → "phục vụ bàn")
   */
  async getSuggestions(q?: string): Promise<string[]> {
    const matchStage: FilterQuery<JobDocument> = { status: JobStatus.ACTIVE };

    if (q && q.trim().length > 0) {
      // Regex prefix match on title — fast for short autocomplete queries
      matchStage['title'] = { $regex: `^${q.trim()}`, $options: 'i' };
    }

    const pipeline: any[] = [
      // Stage 1: filter to active jobs only (optionally narrowed by prefix)
      { $match: matchStage },

      // Stage 2: project both title and industry as separate suggestion sources
      {
        $project: {
          suggestions: {
            $concatArrays: [
              ['$title'],
              ['$industry'],
            ],
          },
        },
      },

      // Stage 3: unwind so each suggestion is a separate document
      { $unwind: '$suggestions' },

      // Stage 4: apply prefix filter to the unwound values if q is provided
      ...(q && q.trim().length > 0
        ? [
            {
              $match: {
                suggestions: { $regex: `^${q.trim()}`, $options: 'i' },
              },
            },
          ]
        : []),

      // Stage 5: deduplicate
      {
        $group: {
          _id: '$suggestions',
        },
      },

      // Stage 6: sort alphabetically for consistent UX
      { $sort: { _id: 1 } },

      // Stage 7: cap result set
      { $limit: 10 },
    ];

    const results = await this.jobModel.aggregate<{ _id: string }>(pipeline);
    return results.map((r) => r._id);
  }

  // ─── Master Data: Industries ───────────────────────────────────────────────

  /** Returns all industry definitions from in-memory constants. O(1). */
  getAllIndustries(): readonly Industry[] {
    return INDUSTRIES;
  }

  /**
   * Returns a single industry by its slug-style ID (e.g. "fnb", "event").
   * Throws ERR_4001 if no matching industry is found.
   */
  getIndustryById(id: string): Industry {
    const industry = INDUSTRIES.find((ind) => ind.id === id);
    if (!industry) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Industry with ID "${id}" not found.`,
      });
    }
    return industry;
  }

  /**
   * Returns a paginated list of ACTIVE jobs for a given industry ID.
   * The industry `name` from constants is matched against the job `industry` field
   * using an exact case-insensitive regex so "F&B" matches "F&B - Coffee Shop" too.
   *
   * @param industryId  Slug-style industry ID from INDUSTRIES constants.
   * @param page        Page number (1-indexed). Default: 1.
   * @param limit       Page size (max 100). Default: 10.
   */
  async getJobsByIndustry(industryId: string, page = 1, limit = 10) {
    // Validate industry exists first — throws ERR_4001 if not
    const industry = this.getIndustryById(industryId);

    const skip = (page - 1) * limit;

    const filter: FilterQuery<JobDocument> = {
      status: JobStatus.ACTIVE,
      industry: { $regex: industry.name, $options: 'i' },
    };

    const [data, total] = await Promise.all([
      this.jobModel
        .find(filter)
        .sort({ isPinned: -1, isUrgent: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.jobModel.countDocuments(filter),
    ]);

    return {
      industry,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Master Data: Locations ────────────────────────────────────────────────

  /** Returns all provinces (without district arrays) for a lightweight list. */
  getAllProvinces(): Array<Omit<Province, 'districts'>> {
    return PROVINCES.map(({ id, name, slug, region }) => ({
      id,
      name,
      slug,
      region,
    }));
  }

  /**
   * Returns the district list for a given province ID (e.g. "hcm", "hanoi").
   * Throws ERR_4001 if the province ID is not recognised.
   *
   * @param provinceId  Province ID from the PROVINCES constants.
   */
  getDistrictsByProvince(provinceId: string): { province: Omit<Province, 'districts'>; districts: readonly District[] } {
    const province = PROVINCES.find((p) => p.id === provinceId);
    if (!province) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Province with ID "${provinceId}" not found.`,
      });
    }

    const { districts, ...provinceMeta } = province;
    return { province: provinceMeta, districts };
  }

  // ─── Master Data: Skills ───────────────────────────────────────────────────

  /** Returns all skill definitions. O(1). */
  getAllSkills(): readonly Skill[] {
    return SKILLS;
  }

  // ─── Master Data: Levels ───────────────────────────────────────────────────

  /** Returns all experience level definitions derived from ExperienceLevel enum. O(1). */
  getAllLevels(): readonly Level[] {
    return LEVELS;
  }

  // ─── Master Data: Job Types ────────────────────────────────────────────────

  /** Returns all casual job type definitions derived from CasualJobType enum. O(1). */
  getAllJobTypes(): readonly JobType[] {
    return JOB_TYPES;
  }
}
