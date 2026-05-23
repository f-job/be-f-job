import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EmployerProfile, EmployerProfileDocument, EmployerStatus } from './schemas/employer-profile.schema';

@Injectable()
export class EmployersService {
  constructor(
    @InjectModel(EmployerProfile.name)
    private readonly employerProfileModel: Model<EmployerProfileDocument>,
  ) {}

  async createProfile(
    userId: string | Types.ObjectId,
    data: {
      companyName: string;
      companyDescription?: string;
      website?: string;
      industry?: string;
      companySize?: string;
      address?: string;
    },
  ): Promise<EmployerProfileDocument> {
    const profile = new this.employerProfileModel({
      userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
      ...data,
      status: EmployerStatus.PENDING_APPROVAL,
    });
    return profile.save();
  }

  async findByUserId(userId: string | Types.ObjectId): Promise<EmployerProfileDocument | null> {
    const parsedUserId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.employerProfileModel.findOne({ userId: parsedUserId }).exec();
  }
}
