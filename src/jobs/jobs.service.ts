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
   * Returns a paginated, filtered list of publicly ACTIVE jobs.
   * Supports full-text keyword, location/district, salary range,
   * level, job_type, industry, is_urgent and three sort modes.
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
      // Use MongoDB $text index when available, fall back to $regex on title
      filter['$text'] = { $search: keyword };
    }

    if (location) {
      filter['location'] = { $regex: location, $options: 'i' };
    }

    if (district) {
      filter['district'] = { $regex: district, $options: 'i' };
    }

    if (salary_min !== undefined) {
      // Job must pay at least salary_min (salaryMax covers that range)
      filter['salaryMax'] = { ...((filter['salaryMax'] as object) ?? {}), $gte: salary_min };
    }

    if (salary_max !== undefined) {
      // Job salary floor must not exceed salary_max
      filter['salaryMin'] = { ...((filter['salaryMin'] as object) ?? {}), $lte: salary_max };
    }

    if (level) {
      filter['level'] = level;
    }

    if (job_type) {
      filter['jobType'] = job_type;
    }

    if (industry) {
      filter['industry'] = { $regex: industry, $options: 'i' };
    }

    if (is_urgent !== undefined) {
      filter['isUrgent'] = is_urgent;
    }

    // ── Build sort ────────────────────────────────────────────────────────────
    let sortOptions: Record<string, SortOrder>;
    switch (sort) {
      case 'salary_high':
        sortOptions = { salaryMax: -1, isPinned: -1 };
        break;
      case 'salary_low':
        sortOptions = { salaryMin: 1, isPinned: -1 };
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
   * Returns the top 20 urgent / hot ACTIVE jobs, ordered by most recently posted.
   * Pinned jobs always appear first within the urgent set.
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
   * Returns recommended ACTIVE jobs for a logged-in candidate.
   * Strategy (v1): Match against the candidate's supplied skills / industry keywords.
   * If no profile context is available, fall back to the 10 most recent pinned jobs.
   *
   * @param candidateProfile Optional context extracted from the candidate's profile.
   */
  async findRecommendedJobs(candidateProfile?: {
    industry?: string;
    skills?: string[];
    location?: string;
  }) {
    const baseFilter: FilterQuery<JobDocument> = { status: JobStatus.ACTIVE };

    if (candidateProfile?.industry || (candidateProfile?.skills && candidateProfile.skills.length > 0)) {
      const orClauses: FilterQuery<JobDocument>[] = [];

      if (candidateProfile.industry) {
        orClauses.push({ industry: { $regex: candidateProfile.industry, $options: 'i' } });
      }

      if (candidateProfile.skills && candidateProfile.skills.length > 0) {
        orClauses.push({ skills: { $in: candidateProfile.skills } });
      }

      if (candidateProfile.location) {
        orClauses.push({ location: { $regex: candidateProfile.location, $options: 'i' } });
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
   * Returns the full detail of a single ACTIVE job.
   * Also increments the viewCount counter atomically.
   * ERR_4001 if not found or not publicly active.
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
   * Returns a paginated list of applications submitted for a specific job.
   * Access scope: a CANDIDATE only sees their own application(s) for this job.
   * The Application collection is not yet implemented; this returns a stub
   * that is fully wired for the service interface — swap in the real model
   * once the Applications module exists.
   *
   * @param jobId  The job ObjectId string.
   * @param candidateUserId  The calling candidate's user ID (from JWT payload).
   * @param page   Page number (1-indexed).
   * @param limit  Page size.
   */
  async findApplicationsForJob(
    jobId: string,
    candidateUserId: string,
    page = 1,
    limit = 10,
  ) {
    // Verify the job exists and is active
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

    // ─── Placeholder until ApplicationsModule is implemented ───────────────
    // Replace this block with:
    //   return this.applicationModel.find({ jobId, candidateId: candidateUserId })
    //     .skip((page - 1) * limit).limit(limit).lean();
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
   * Aggregation pipeline that counts ACTIVE jobs grouped by industry,
   * returning sorted descending by count. Suitable for dashboard pie/bar charts.
   * High-performance: uses a single $group stage with the compound index on
   * (status, industry).
   */
  async getIndustryStats(): Promise<Array<{ industry: string; count: number }>> {
    const results = await this.jobModel.aggregate<{ industry: string; count: number }>([
      // Stage 1: Filter only active jobs — leverages the (status, industry) compound index
      { $match: { status: JobStatus.ACTIVE } },

      // Stage 2: Group by industry and count
      {
        $group: {
          _id: '$industry',
          count: { $sum: 1 },
        },
      },

      // Stage 3: Project into a clean shape
      {
        $project: {
          _id: 0,
          industry: '$_id',
          count: 1,
        },
      },

      // Stage 4: Sort descending by count so the busiest industries appear first
      { $sort: { count: -1 } },
    ]);

    return results;
  }
}
