import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument, JobStatus } from '../jobs/schemas/job.schema';
import { EmployerProfile } from '../employers/schemas/employer-profile.schema';
import { CreateEmployerJobDto } from './dto/create-employer-job.dto';
import { UpdateEmployerJobDto } from './dto/update-employer-job.dto';
import { EmployerJobsQueryDto } from './dto/employer-jobs-query.dto';
import { Application, ApplicationDocument } from './schemas/application.schema';

@Injectable()
export class EmployerJobsService {
    constructor(
        @InjectModel(Job.name)
        private readonly jobModel: Model<JobDocument>,

        @InjectModel(EmployerProfile.name)
        private readonly employerModel: Model<EmployerProfile>,

        @InjectModel(Application.name)
        private readonly applicationModel: Model<ApplicationDocument>,

    ) { }

    // ─────────────────────────────────────────────
    // Resolve the employer profile for the calling user, or throw 404.
    // Centralised so every method enforces the null-check consistently.
    // ─────────────────────────────────────────────
    private async getEmployerOrThrow(userId: string) {
        const employer = await this.employerModel.findOne({ userId });
        if (!employer) {
            throw new NotFoundException('Employer profile not found');
        }
        return employer;
    }

    // ─────────────────────────────────────────────
    // Resolve a job owned by the employer, or throw 404.
    // ─────────────────────────────────────────────
    private async getOwnedJobOrThrow(employerId: Types.ObjectId, jobId: string) {
        const job = await this.jobModel.findOne({
            _id: new Types.ObjectId(jobId),
            employerId,
        });
        if (!job) {
            throw new NotFoundException('Job not found');
        }
        return job;
    }

    // ─────────────────────────────────────────────
    // CREATE JOB
    // ─────────────────────────────────────────────
    async create(userId: string, dto: CreateEmployerJobDto) {
        const employer = await this.getEmployerOrThrow(userId);

        const job = await this.jobModel.create({
            ...dto,
            employerId: employer._id,
            companyName: employer.companyName,
            companyLogoUrl: employer.logoUrl,
            status: JobStatus.PENDING,
        });

        return job;
    }

    // ─────────────────────────────────────────────
    // GET MY JOBS
    // ─────────────────────────────────────────────
    async findAll(userId: string, query: EmployerJobsQueryDto) {
        const employer = await this.getEmployerOrThrow(userId);

        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const skip = (page - 1) * limit;

        const filter: any = {
            employerId: employer._id,
        };

        if (query.status) {
            filter.status = query.status;
        }

        const [data, total] = await Promise.all([
            this.jobModel
                .find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
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

    // ─────────────────────────────────────────────
    // GET ONE JOB
    // ─────────────────────────────────────────────
    async findOne(userId: string, jobId: string) {
        const employer = await this.getEmployerOrThrow(userId);
        return this.getOwnedJobOrThrow(employer._id as Types.ObjectId, jobId);
    }

    // ─────────────────────────────────────────────
    // UPDATE JOB
    // ─────────────────────────────────────────────
    async update(
        userId: string,
        jobId: string,
        dto: UpdateEmployerJobDto,
    ) {
        const employer = await this.getEmployerOrThrow(userId);

        const job = await this.jobModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(jobId),
                employerId: employer._id,
            },
            {
                $set: dto,
            },
            { new: true },
        );

        if (!job) {
            throw new NotFoundException('Job not found');
        }

        return job;
    }

    // ─────────────────────────────────────────────
    // DELETE (soft delete)
    // ─────────────────────────────────────────────
    async remove(userId: string, jobId: string) {
        const employer = await this.getEmployerOrThrow(userId);

        const job = await this.jobModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(jobId),
                employerId: employer._id,
            },
            {
                $set: {
                    status: JobStatus.CLOSED,
                },
            },
            { new: true },
        );

        if (!job) {
            throw new NotFoundException('Job not found');
        }

        return job;
    }

    async refresh(userId: string, jobId: string) {
        const employer = await this.getEmployerOrThrow(userId);
        const job = await this.getOwnedJobOrThrow(employer._id as Types.ObjectId, jobId);

        await job.save(); // auto updatedAt

        return {
            message: 'Job refreshed successfully',
            job,
        };
    }

    async duplicate(userId: string, jobId: string) {
        const employer = await this.getEmployerOrThrow(userId);
        const job = await this.getOwnedJobOrThrow(employer._id as Types.ObjectId, jobId);

        const newJob = await this.jobModel.create({
            ...job.toObject(),
            _id: undefined,
            status: JobStatus.PENDING,
            createdAt: undefined,
            updatedAt: undefined,
        });

        return newJob;
    }

    async close(userId: string, jobId: string) {
        const employer = await this.getEmployerOrThrow(userId);

        const job = await this.jobModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(jobId),
                employerId: employer._id,
            },
            {
                $set: { status: JobStatus.CLOSED },
            },
            { new: true },
        );

        if (!job) throw new NotFoundException('Job not found');

        return job;
    }

    async extend(userId: string, jobId: string) {
        const employer = await this.getEmployerOrThrow(userId);
        const job = await this.getOwnedJobOrThrow(employer._id as Types.ObjectId, jobId);

        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 7); // +7 ngày

        // NOTE: schema field is `expiresAt` (not `expiredAt`). Using the wrong
        // name caused Mongoose to silently drop the update.
        job.set({ expiresAt: newExpiresAt });
        await job.save();

        return {
            message: 'Job extended successfully',
            expiresAt: newExpiresAt,
        };
    }

    async getApplications(userId: string, jobId: string) {
        const employer = await this.getEmployerOrThrow(userId);
        const job = await this.getOwnedJobOrThrow(employer._id as Types.ObjectId, jobId);

        const applications = await this.applicationModel.find({
            jobId: job._id,
        });

        return {
            jobId,
            total: applications.length,
            data: applications,
        };
    }

}
