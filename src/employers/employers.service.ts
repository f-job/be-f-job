import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  EmployerProfile,
  EmployerStatus,
} from '../employers/schemas/employer-profile.schema';

import {
  User,
  UserRole,
  UserStatus,
} from '../users/schemas/user.schema';

import { UpdateEmployerDto } from '../employers/dto/update-employer.dto';
import { RejectEmployerDto } from '../employers/dto/reject-employer.dto';
import { CandidateProfile, CandidateProfileDocument } from '@/candidates/schemas/candidate-profile.schema';
import { Application, ApplicationDocument, ApplicationStatus } from '@/applications/schemas/application.schema';
import { BulkRejectDto } from './dto/bulk-reject.dto';
import { FavoriteCandidate, FavoriteCandidateDocument } from './schemas/favorite-candidates.schema';
import { BulkInterviewDto } from './dto/bulk-interview.dto';
import { InterviewDocument } from '@/interviews/schemas/interview.schema';
import { PackagesService } from '../packages/packages.service';
import { CreditTransactionType } from '../packages/schemas/credit-transaction.schema';

@Injectable()
export class EmployerService {
  constructor(
    @InjectModel(EmployerProfile.name)
    private employerModel: Model<EmployerProfile>,

    @InjectModel(User.name)
    private userModel: Model<User>,

    @InjectModel(CandidateProfile.name)
    private readonly candidateModel: Model<CandidateProfileDocument>,

    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,

    @InjectModel(FavoriteCandidate.name)
    private readonly favoriteModel: Model<FavoriteCandidateDocument>,

    @InjectModel('Interview')
    private readonly interviewModel: Model<InterviewDocument>,

    private readonly packagesService: PackagesService,
  ) { }

  // GET /users/employers
  async findAll() {
    return this.employerModel
      .find()
      .populate('userId', 'email fullName status')
      .sort({ createdAt: -1 });
  }

  // GET /users/employers/:id
  async findOne(id: string) {
    const employer = await this.employerModel
      .findById(id)
      .populate('userId', 'email fullName status');

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    return employer;
  }

  // PUT /users/employers/:id
  async update(
    id: string,
    dto: UpdateEmployerDto,
  ) {
    const employer = await this.employerModel.findByIdAndUpdate(
      id,
      dto,
      {
        new: true,
      },
    );

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    return employer;
  }

  // VERIFY
  async verify(
    id: string,
    adminId: string,
  ) {
    const employer = await this.employerModel.findById(id);

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    employer.status = EmployerStatus.APPROVED;
    employer.verifiedAt = new Date();
    employer.verifiedBy = new Types.ObjectId(adminId);
    employer.rejectedReason = undefined;

    await employer.save();

    return employer;
  }

  // REJECT
  async reject(
    id: string,
    dto: RejectEmployerDto,
  ) {
    const employer = await this.employerModel.findById(id);

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    employer.status = EmployerStatus.REJECTED;
    employer.rejectedReason = dto.reason;

    await employer.save();

    return employer;
  }

  // BLOCK
  async block(
    id: string,
    blockedReason: string,
  ) {
    const employer = await this.employerModel.findById(id);

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    // Block user account
    await this.userModel.findByIdAndUpdate(
      employer.userId,
      {
        status: UserStatus.BLOCKED,
      },
    );

    // Update employer profile
    employer.status = EmployerStatus.BLOCKED;
    employer.blockedAt = new Date();
    employer.blockedReason = blockedReason;

    await employer.save();

    return {
      message: 'Employer blocked successfully',
    };
  }

  // DELETE
  async remove(id: string) {
    const employer = await this.employerModel.findById(id);

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    await this.userModel.findByIdAndDelete(
      employer.userId,
    );

    await employer.deleteOne();

    return {
      message: 'Employer deleted successfully',
    };
  }

  async createProfile(
    userId: string,
    data: {
      companyName: string;
      companyDescription?: string;
      website?: string;
      industry?: string;
      companySize?: string;
      address?: string;
    },
  ) {
    const employer = await this.employerModel.create({
      userId: new Types.ObjectId(userId),

      companyName: data.companyName,
      companyDescription: data.companyDescription,
      website: data.website,
      industry: data.industry,
      companySize: data.companySize,
      address: data.address,

      status: EmployerStatus.PENDING_APPROVAL,
    });

    return employer;
  }

  async searchCandidates(query: any) {
    const filter: any = {};

    if (query.keyword) {
      filter.$or = [
        { fullName: { $regex: query.keyword, $options: 'i' } },
        { skills: { $regex: query.keyword, $options: 'i' } },
        { headline: { $regex: query.keyword, $options: 'i' } },
      ];
    }

    if (query.openToWork !== undefined) {
      filter.openToWork = query.openToWork === 'true';
    }

    return this.candidateModel.find(filter).limit(20);
  }

  async getCandidate(id: string) {
    const candidate = await this.candidateModel.findById(id);

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    return candidate;
  }

  async downloadCV(id: string) {
    const candidate = await this.candidateModel.findById(id);

    if (!candidate || !candidate.resumeUrl) {
      throw new NotFoundException('CV not found');
    }

    return {
      url: candidate.resumeUrl,
    };
  }

  async unlockCandidate(userId: string, candidateId: string) {
    const employer = await this.employerModel.findOne({ userId });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const candidate = await this.candidateModel.findById(candidateId);

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Check if unlocked within last 14 days
    const isFree = await this.packagesService.hasUnlockedRecently(userId, candidateId);

    if (!isFree) {
      // Deduct points
      const config = await this.packagesService.getCreditConfig();
      await this.packagesService.deductCredits(
        userId,
        config.unlockCvPoints,
        CreditTransactionType.PROFILE_UNLOCK,
        candidateId,
        `Unlocked CV of candidate ${candidate.fullName}`
      );
    }

    return {
      message: isFree ? 'CV unlocked for free (within 14 days)' : 'Unlocked successfully',
      candidate,
    };
  }

  async getATS(applicationId: string) {
    const app = await this.applicationModel
      .findById(applicationId)
      .populate('jobId')
      .populate('candidateId');

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    return {
      application: app,
      job: app.jobId,
      candidate: app.candidateId,
      status: app.status,
    };
  }

  async getFavorites(
    userId: string,
  ) {
    const employer =
      await this.employerModel.findOne({
        userId,
      });

    return this.favoriteModel
      .find({
        employerId: employer._id,
      })
      .populate('candidateId')
      .sort({
        createdAt: -1,
      });
  }

  async addFavorite(
    userId: string,
    candidateId: string,
  ) {
    const employer =
      await this.employerModel.findOne({
        userId,
      });

    const candidate =
      await this.candidateModel.findById(
        candidateId,
      );

    if (!candidate) {
      throw new NotFoundException(
        'Candidate not found',
      );
    }

    const favorite =
      await this.favoriteModel.findOne({
        employerId: employer._id,
        candidateId,
      });

    if (favorite) {
      return {
        message:
          'Candidate already saved',
      };
    }

    return this.favoriteModel.create({
      employerId: employer._id,
      candidateId,
    });
  }

  async removeFavorite(
    userId: string,
    candidateId: string,
  ) {
    const employer =
      await this.employerModel.findOne({
        userId,
      });

    await this.favoriteModel.deleteOne({
      employerId: employer._id,
      candidateId,
    });

    return {
      message:
        'Candidate removed from favorites',
    };
  }

  async bulkReject(
    userId: string,
    dto: BulkRejectDto,
  ) {
    const employer =
      await this.employerModel.findOne({
        userId,
      });

    let updated = 0;

    for (const id of dto.applicationIds) {
      const application =
        await this.applicationModel.findById(
          id,
        );

      if (!application) {
        continue;
      }

      application.status =
        ApplicationStatus.REJECTED;

      application.employerNote =
        dto.reason;

      await application.save();

      /*
        TODO:
        send reject email
      */

      updated++;
    }

    return {
      message:
        'Bulk reject completed',
      updated,
    };
  }

  async bulkInterview(
    userId: string,
    dto: BulkInterviewDto,
  ) {
    const employer =
      await this.employerModel.findOne({
        userId,
      });

    let created = 0;

    for (const id of dto.applicationIds) {
      const application =
        await this.applicationModel.findById(
          id,
        );

      if (!application) {
        continue;
      }

      const exists =
        await this.interviewModel.findOne({
          applicationId:
            application._id,
        });

      if (exists) {
        continue;
      }

      await this.interviewModel.create({
        applicationId:
          application._id,

        candidateId:
          application.candidateId,

        employerId:
          employer._id,

        scheduledAt:
          new Date(
            dto.scheduledAt,
          ),
      });

      application.status =
        ApplicationStatus.SCHEDULED;

      application.scheduledAt =
        new Date(
          dto.scheduledAt,
        );

      await application.save();

      /*
        TODO:
        send interview email
      */

      created++;
    }

    return {
      message:
        'Bulk interview completed',
      created,
    };
  }
}