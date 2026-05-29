import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery, SortOrder } from 'mongoose';
import { Job, JobDocument, JobStatus } from './schemas/job.schema';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,
  ) {}

  // ─── GET /jobs ─────────────────────────────────────────────────────────────

  /**
   * Returns a paginated, filtered list of publicly ACTIVE casual jobs.
   *
   * Salary filtering:
   *   The schema stores a single flat `salaryAmount` (not a min/max band).
   *   salary_min → salaryAmount $gte salary_min (job pays AT LEAST this rate)
   *   salary_max → salaryAmount $lte salary_max (job pays AT MOST this rate)
   *   Both can be combined to find jobs within a wage range.
   */
  async findPublicJobs(query: ListJobsQueryDto) {
    const {
      keyword,
      location,
      district,
      salary_min,
      salary_max,
      level,
      job_type,
      industry,
      is_urgent,
      sort = 'newest',
      page = 1,
      limit = 10,
    } = query;

    const skip = (page - 1) * limit;

    // ── Build filter ──────────────────────────────────────────────────────────
    const filter: FilterQuery<JobDocument> = { status: JobStatus.ACTIVE };

    if (keyword) {
      // Uses the compound text index on (title, description, companyName)
      filter['$text'] = { $search: keyword };
    }

    if (location) {
      filter['location'] = { $regex: location, $options: 'i' };
    }

    if (district) {
      filter['district'] = { $regex: district, $options: 'i' };
    }

    // Flat salary range filter against the single salaryAmount scalar.
    // Both conditions can coexist on the same field without conflict.
    if (salary_min !== undefined || salary_max !== undefined) {
      const salaryFilter: Record<string, number> = {};
      if (salary_min !== undefined) salaryFilter['$gte'] = salary_min;
      if (salary_max !== undefined) salaryFilter['$lte'] = salary_max;
      filter['salaryAmount'] = salaryFilter;
    }

    if (level) {
      // Exact enum match against ExperienceLevel values
      filter['level'] = level;
    }

    if (job_type) {
      // Exact enum match against CasualJobType values
      filter['jobType'] = job_type;
    }

    if (industry) {
      filter['industry'] = { $regex: industry, $options: 'i' };
    }

    if (is_urgent !== undefined) {
      filter['isUrgent'] = is_urgent;
    }

    // ── Build sort ────────────────────────────────────────────────────────────
    // All salary sorts now act on the flat `salaryAmount` field.
    // isPinned = -1 ensures promoted listings always surface at the top
    // within the requested sort order.
    let sortOptions: Record<string, SortOrder>;
    switch (sort) {
      case 'salary_high':
        sortOptions = { salaryAmount: -1, isPinned: -1 };
        break;
      case 'salary_low':
        sortOptions = { salaryAmount: 1, isPinned: -1 };
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

  // ─── GET /jobs/urgent ──────────────────────────────────────────────────────

  /**
   * Returns the top 20 urgent / hot ACTIVE casual gigs, ordered by
   * pinned status then most recently posted.
   * Urgent gigs are flagged by the employer (e.g. "need staff tonight").
   */
  async findUrgentJobs() {
    const data = await this.jobModel
      .find({ status: JobStatus.ACTIVE, isUrgent: true })
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(20)
      .lean();

    return { data, total: data.length };
  }

  // ─── GET /jobs/recommended ─────────────────────────────────────────────────

  /**
   * Returns up to 10 recommended ACTIVE casual gigs for a logged-in candidate.
   *
   * Matching strategy (v1 — profile-context based):
   *   1. Industry match  — gigs in the same industry sector.
   *   2. Benefits match  — gigs offering benefits the candidate values
   *      (e.g. ["Bao cơm", "Tips"]) replacing the old corporate skills array.
   *   3. Location match  — gigs in the candidate's city.
   * Falls back to the 10 most recent pinned gigs if no profile context is available.
   *
   * @param candidateProfile  Lightweight profile context from the JWT payload.
   *                          Enriched via CandidateProfile lookup once the
   *                          Profiles module is fully implemented.
   */
  async findRecommendedJobs(candidateProfile?: {
    industry?: string;
    benefits?: string[];
    location?: string;
  }) {
    const baseFilter: FilterQuery<JobDocument> = { status: JobStatus.ACTIVE };

    const hasProfileData =
      candidateProfile?.industry ||
      (candidateProfile?.benefits && candidateProfile.benefits.length > 0) ||
      candidateProfile?.location;

    if (hasProfileData) {
      const orClauses: FilterQuery<JobDocument>[] = [];

      if (candidateProfile!.industry) {
        orClauses.push({
          industry: { $regex: candidateProfile!.industry, $options: 'i' },
        });
      }

      // Match gigs that offer any of the candidate's preferred benefits
      if (candidateProfile!.benefits && candidateProfile!.benefits.length > 0) {
        orClauses.push({ benefits: { $in: candidateProfile!.benefits } });
      }

      if (candidateProfile!.location) {
        orClauses.push({
          location: { $regex: candidateProfile!.location, $options: 'i' },
        });
      }

      baseFilter['$or'] = orClauses;
    }

    const data = await this.jobModel
      .find(baseFilter)
      .sort({ isPinned: -1, isUrgent: -1, createdAt: -1 })
      .limit(10)
      .lean();

    return { data, total: data.length };
  }

  // ─── GET /jobs/:id ─────────────────────────────────────────────────────────

  /**
   * Returns the full detail of a single ACTIVE casual job.
   * Atomically increments the `viewCount` field on each successful request.
   * Throws ERR_4001 if the job is not found or is not in ACTIVE status.
   */
  async findJobById(id: string): Promise<JobDocument> {
    const objectId = new Types.ObjectId(id);

    const job = await this.jobModel
      .findOneAndUpdate(
        { _id: objectId, status: JobStatus.ACTIVE },
        { $inc: { viewCount: 1 } },
        { new: true },
      )
      .lean();

    if (!job) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Job with ID "${id}" not found or is no longer active.`,
      });
    }

    return job as JobDocument;
  }

  // ─── GET /jobs/:id/applications ────────────────────────────────────────────

  /**
   * Returns a paginated list of the calling candidate's own application(s)
   * submitted for a specific casual job.
   *
   * The Application collection is not yet implemented. This method performs
   * the job-existence guard fully so the 404 path is production-ready.
   * Swap the stub return for a real ApplicationModel query once
   * ApplicationsModule is built.
   *
   * @param jobId           The job ObjectId string (validated by ParseObjectIdPipe).
   * @param candidateUserId The calling CANDIDATE's user ID from the JWT payload.
   * @param page            Page number (1-indexed).
   * @param limit           Page size.
   */
  async findApplicationsForJob(
    jobId: string,
    candidateUserId: string,
    page = 1,
    limit = 10,
  ) {
    // Guard: confirm the job exists and is still accepting views
    const jobExists = await this.jobModel.exists({
      _id: new Types.ObjectId(jobId),
      status: JobStatus.ACTIVE,
    });

    if (!jobExists) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Job with ID "${jobId}" not found or is no longer active.`,
      });
    }

    // ── Placeholder — replace with real ApplicationModel query ──────────────
    // return this.applicationModel
    //   .find({ jobId: new Types.ObjectId(jobId), candidateId: candidateUserId })
    //   .skip((page - 1) * limit)
    //   .limit(limit)
    //   .lean();
    return {
      data: [],
      meta: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        note: 'Applications module is not yet implemented.',
      },
    };
  }

  // ─── GET /jobs/stats/industry ──────────────────────────────────────────────

  /**
   * High-performance Aggregation Pipeline that counts ACTIVE casual jobs
   * grouped by industry (e.g. "F&B", "Sự kiện", "Bán lẻ", "Giao hàng").
   *
   * Pipeline stages:
   *   1. $match  — filters ACTIVE jobs; leverages the (status, industry) compound index.
   *   2. $group  — counts documents per industry value.
   *   3. $project — reshapes _id → industry for a clean consumer-facing shape.
   *   4. $sort   — descending by count so the busiest industries appear first.
   *
   * Suitable for dashboard pie / bar charts in the Admin panel.
   */
  async getIndustryStats(): Promise<Array<{ industry: string; count: number }>> {
    const results = await this.jobModel.aggregate<{
      industry: string;
      count: number;
    }>([
      // Stage 1: Restrict to active jobs — compound index (status, industry) is used here
      { $match: { status: JobStatus.ACTIVE } },

      // Stage 2: Count per industry
      {
        $group: {
          _id: '$industry',
          count: { $sum: 1 },
        },
      },

      // Stage 3: Clean output shape
      {
        $project: {
          _id: 0,
          industry: '$_id',
          count: 1,
        },
      },

      // Stage 4: Busiest casual industries first
      { $sort: { count: -1 } },
    ]);

    return results;
  }
}
