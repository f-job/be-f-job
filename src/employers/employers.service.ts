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
import { Application, ApplicationDocument } from '@/applications/schemas/application.schema';

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

  async unlockCandidate(employerId: string, candidateId: string) {
    const employer = await this.employerModel.findById(employerId);

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    if (employer.credit <= 0) {
      throw new ForbiddenException('Not enough credit');
    }

    employer.credit -= 1;
    await employer.save();

    const candidate = await this.candidateModel.findById(candidateId);

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    return {
      message: 'Unlocked successfully',
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
}