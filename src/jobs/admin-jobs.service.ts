import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument, JobStatus } from './schemas/job.schema';
import { AdminJobsQueryDto } from './dto/admin-jobs-query.dto';

/**
 * Admin moderation service for casual job postings.
 *
 * Moderation workflow:
 *   pending → (approve) → active
 *   pending → (reject)  → draft   (+ rejectionReason, employer can edit & resubmit)
 *   any     → (hide)    → closed  (taken down for violations)
 */
@Injectable()
export class AdminJobsService {
  constructor(
    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,
  ) {}

  // ─── List jobs for moderation (defaults to PENDING) ───────────────────────
  async findAll(query: AdminJobsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status;
    }

    const [data, total] = await Promise.all([
      this.jobModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      this.jobModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Pending queue shortcut ───────────────────────────────────────────────
  async findPending(query: AdminJobsQueryDto) {
    return this.findAll({ ...query, status: JobStatus.PENDING });
  }

  async findOne(jobId: string) {
    const job = await this.jobModel.findById(new Types.ObjectId(jobId)).lean();
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  // ─── Approve: pending → active ────────────────────────────────────────────
  async approve(jobId: string) {
    const job = await this.jobModel.findById(new Types.ObjectId(jobId));
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.PENDING) {
      throw new BadRequestException(
        `Only jobs in "pending" status can be approved (current: "${job.status}").`,
      );
    }

    job.status = JobStatus.ACTIVE;
    job.rejectionReason = undefined;
    await job.save();
    return job;
  }

  // ─── Reject: pending → draft (with reason) ────────────────────────────────
  async reject(jobId: string, reason?: string) {
    const job = await this.jobModel.findById(new Types.ObjectId(jobId));
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.PENDING) {
      throw new BadRequestException(
        `Only jobs in "pending" status can be rejected (current: "${job.status}").`,
      );
    }

    job.status = JobStatus.DRAFT;
    job.rejectionReason = reason;
    await job.save();
    return job;
  }

  // ─── Hide: any → closed (violations / takedown) ───────────────────────────
  async hide(jobId: string, reason?: string) {
    const update: Record<string, unknown> = {
      status: JobStatus.CLOSED,
    };
    if (reason) {
      update.rejectionReason = reason;
    }

    // Use an atomic update instead of document.save(). Some legacy postings
    // predate required fields such as `level`; hiding them must still work.
    const job = await this.jobModel.findByIdAndUpdate(
      new Types.ObjectId(jobId),
      { $set: update },
      { new: true },
    );
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  // ─── Toggle / set the "urgent" (tuyển gấp) flag ───────────────────────────
  async setUrgent(jobId: string, isUrgent?: boolean) {
    const currentJob = await this.jobModel.findById(new Types.ObjectId(jobId)).lean();
    if (!currentJob) {
      throw new NotFoundException('Job not found');
    }

    const job = await this.jobModel.findByIdAndUpdate(
      new Types.ObjectId(jobId),
      {
        $set: {
          isUrgent: typeof isUrgent === 'boolean' ? isUrgent : !currentJob.isUrgent,
        },
      },
      { new: true },
    );
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }
}
