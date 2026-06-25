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
import { User, UserDocument } from '../users/schemas/user.schema';
import { Application, ApplicationDocument, ApplicationStatus } from '../applications/schemas/application.schema';
import { CandidateProfileDocument, CandidateProfile } from '@/candidates/schemas/candidate-profile.schema';
import { UpdateApplicationStatusDto } from '@/applications/dto/update-application-status.dto';
import { ScheduleInterviewDto } from '@/applications/dto/schedule-interview.dto';
import { RejectApplicationDto } from '@/applications/dto/reject-application.dto';
import { EmailService } from '../email/email.service';
import { Review, ReviewDirection, ReviewDocument } from '@/reviews/schemas/review.schema';

@Injectable()
export class EmployerJobsService {
    constructor(
        @InjectModel(Job.name)
        private readonly jobModel: Model<JobDocument>,

        @InjectModel(EmployerProfile.name)
        private readonly employerModel: Model<EmployerProfile>,

        @InjectModel(Application.name)
        private readonly applicationModel: Model<ApplicationDocument>,

        @InjectModel(CandidateProfile.name)
        private readonly candidateModel: Model<CandidateProfileDocument>,

        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,

        private readonly emailService: EmailService,

        @InjectModel(Review.name)
        private readonly reviewModel: Model<ReviewDocument>,

    ) { }

    // ─────────────────────────────────────────────
    // Resolve the employer profile for the calling user, or throw 404.
    // Centralised so every method enforces the null-check consistently.
    // ─────────────────────────────────────────────
    // CREATE JOB
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

        // Gửi email thông báo đến admin khi có job mới
        // Lấy thông tin user để có email của employer
        const user = await this.userModel.findById(userId).lean();

        await this.emailService.sendNewJobNotificationToAdmin({
            jobId: job._id.toString(),
            title: job.title,
            companyName: job.companyName,
            location: job.location,
            district: job.district,
            salaryAmount: job.salaryAmount,
            jobType: job.jobType,
            industry: job.industry,
            employerEmail: user?.email,
            description: job.description,
            createdAt: job.createdAt,
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

    async getApplications(
        userId: string,
        jobId: string,
    ): Promise<{
        jobId: string;
        total: number;
        data: Array<Record<string, any>>;
    }> {
        const employer = await this.getEmployerOrThrow(userId);

        const job = await this.getOwnedJobOrThrow(
            employer._id as Types.ObjectId,
            jobId,
        );

        const applications = await this.applicationModel
            .find({ jobId: job._id })
            .sort({ createdAt: -1 })
            .lean();

        const candidateUserIds = applications.map(
            (a) => a.candidateId,
        );

        const applicationIds = applications.map(
            (a) => a._id,
        );

        const [users, profiles, reviews] = await Promise.all([
            this.userModel
                .find({
                    _id: { $in: candidateUserIds },
                })
                .select('fullName email')
                .lean<
                    Array<{
                        _id: Types.ObjectId;
                        fullName?: string;
                        email?: string;
                    }>
                >(),

            this.candidateModel
                .find({
                    userId: { $in: candidateUserIds },
                })
                .select(
                    'userId fullName phone resumeUrl',
                )
                .lean<
                    Array<{
                        userId: Types.ObjectId;
                        fullName?: string;
                        phone?: string;
                        resumeUrl?: string;
                    }>
                >(),

            this.reviewModel
                .find({
                    applicationId: {
                        $in: applicationIds,
                    },
                    direction:
                        ReviewDirection.EMPLOYER_TO_CANDIDATE,
                })
                .select('applicationId')
                .lean<
                    Array<{
                        applicationId: Types.ObjectId;
                    }>
                >(),
        ]);

        const userById = new Map(
            users.map((u) => [
                u._id.toString(),
                u,
            ]),
        );

        const profileByUserId = new Map(
            profiles.map((p) => [
                p.userId.toString(),
                p,
            ]),
        );

        const reviewedApplicationIds = new Set(
            reviews.map((r) =>
                r.applicationId.toString(),
            ),
        );

        const data = applications.map((app) => {
            const key =
                app.candidateId?.toString();

            const user = key
                ? userById.get(key)
                : undefined;

            const profile = key
                ? profileByUserId.get(key)
                : undefined;

            return {
                ...app,

                candidateName:
                    profile?.fullName ??
                    user?.fullName ??
                    user?.email ??
                    'Ứng viên',

                candidatePhone:
                    profile?.phone ?? null,

                resumeUrl:
                    app.cvPdfUrl ??
                    profile?.resumeUrl ??
                    null,

                reviewed:
                    reviewedApplicationIds.has(
                        app._id.toString(),
                    ),
            };
        });

        return {
            jobId,
            total: data.length,
            data,
        };
    }

    async updateStage(
        applicationId: string,
        dto: UpdateApplicationStatusDto,
    ) {
        const application =
            await this.applicationModel.findByIdAndUpdate(
                applicationId,
                {
                    $set: {
                        status: dto.status,
                    },
                },
                { new: true },
            );

        if (!application) {
            throw new NotFoundException(
                'Application not found',
            );
        }

        return application;
    }

    async scheduleInterview(
        applicationId: string,
        dto: ScheduleInterviewDto,
    ) {
        const application =
            await this.applicationModel.findByIdAndUpdate(
                applicationId,
                {
                    $set: {
                        status: ApplicationStatus.SCHEDULED,
                        scheduledAt: new Date(
                            dto.scheduledAt,
                        ),
                        employerNote:
                            dto.employerNote,
                    },
                },
                { new: true },
            );

        if (!application) {
            throw new NotFoundException(
                'Application not found',
            );
        }

        // TODO:
        // send interview email

        return {
            message:
                'Interview scheduled successfully',
            application,
        };
    }

    async reject(
        applicationId: string,
        dto: RejectApplicationDto,
    ) {
        const application =
            await this.applicationModel.findByIdAndUpdate(
                applicationId,
                {
                    $set: {
                        status: ApplicationStatus.REJECTED,
                        employerNote: dto.reason,
                    },
                },
                { new: true },
            );

        if (!application) {
            throw new NotFoundException(
                'Application not found',
            );
        }

        // TODO:
        // send reject email

        return {
            message:
                'Candidate rejected successfully',
            application,
        };
    }

    async accept(
        applicationId: string,
    ) {
        const application =
            await this.applicationModel.findByIdAndUpdate(
                applicationId,
                {
                    $set: {
                        status: ApplicationStatus.ACCEPTED,
                    },
                },
                { new: true },
            );

        if (!application) {
            throw new NotFoundException(
                'Application not found',
            );
        }

        // TODO:
        // send acceptance email

        return {
            message:
                'Candidate accepted successfully',
            application,
        };
    }


}
