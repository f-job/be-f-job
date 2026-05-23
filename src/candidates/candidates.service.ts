import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CandidateProfile, CandidateProfileDocument } from './schemas/candidate-profile.schema';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectModel(CandidateProfile.name)
    private readonly candidateProfileModel: Model<CandidateProfileDocument>,
  ) {}

  async createProfile(
    userId: string | Types.ObjectId,
    data: {
      fullName: string;
      phone?: string;
      address?: string;
      resumeUrl?: string;
    },
  ): Promise<CandidateProfileDocument> {
    const profile = new this.candidateProfileModel({
      userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
      ...data,
    });
    return profile.save();
  }

  async findByUserId(userId: string | Types.ObjectId): Promise<CandidateProfileDocument | null> {
    const parsedUserId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.candidateProfileModel.findOne({ userId: parsedUserId }).exec();
  }
}
