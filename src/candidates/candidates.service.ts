import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { CandidateProfile, CandidateProfileDocument } from './schemas/candidate-profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { ListCandidatesQueryDto } from './dto/list-candidates-query.dto';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectModel(CandidateProfile.name)
    private readonly candidateProfileModel: Model<CandidateProfileDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  // ─── Existing Methods ──────────────────────────────────────────────────────

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

  // ─── New Methods for Section 2.1 ──────────────────────────────────────────

  /**
   * GET /users/candidates — Paginated list of candidates (Admin only).
   * Joins User + CandidateProfile, with optional keyword filter on fullName or email.
   */
  async findAllCandidates(query: ListCandidatesQueryDto) {
    const { keyword, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Build user filter: role must be CANDIDATE + optional keyword on email
    const userFilter: Record<string, any> = { role: 'CANDIDATE' };
    if (keyword) {
      userFilter['$or'] = [
        { email: { $regex: keyword, $options: 'i' } },
        { fullName: { $regex: keyword, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel.find(userFilter).skip(skip).limit(limit).lean(),
      this.userModel.countDocuments(userFilter),
    ]);

    // Bulk-fetch profiles linked to those users
    const userIds = users.map((u) => u._id);
    const profiles = await this.candidateProfileModel
      .find({ userId: { $in: userIds } })
      .lean();

    const profileMap = new Map(
      profiles.map((p) => [p.userId.toString(), p]),
    );

    const data = users.map((user) => ({
      user,
      profile: profileMap.get(user._id.toString()) ?? null,
    }));

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

  /**
   * GET /users/candidates/:id — Full detail of a single candidate.
   * ERR_4001 if no matching CANDIDATE user or profile exists.
   */
  async findCandidateById(id: string): Promise<{ user: UserDocument; profile: CandidateProfileDocument | null }> {
    const objectId = new Types.ObjectId(id);

    const user = await this.userModel
      .findOne({ _id: objectId, role: 'CANDIDATE' })
      .lean();

    if (!user) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Candidate with ID "${id}" not found.`,
      });
    }

    const profile = await this.candidateProfileModel
      .findOne({ userId: objectId })
      .lean();

    return { user: user as UserDocument, profile: profile as CandidateProfileDocument | null };
  }

  /**
   * PUT /users/candidates/:id — Update candidate profile fields.
   * Self-service: ERR_2001 if a non-Admin caller tries to modify another candidate.
   */
  async updateCandidateProfile(
    id: string,
    dto: UpdateCandidateDto,
    callerId: string,
    callerRole: string,
  ): Promise<CandidateProfileDocument> {
    // Authorization: ADMIN can update any, CANDIDATE only their own
    if (callerRole !== 'ADMIN' && callerId !== id) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message: 'You are not authorized to modify another candidate\'s profile.',
      });
    }

    const objectId = new Types.ObjectId(id);

    // Ensure the target is a valid CANDIDATE
    const userExists = await this.userModel.exists({ _id: objectId, role: 'CANDIDATE' });
    if (!userExists) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Candidate with ID "${id}" not found.`,
      });
    }

    const profile = await this.candidateProfileModel
      .findOneAndUpdate(
        { userId: objectId },
        { $set: dto },
        { new: true, runValidators: true },
      )
      .lean();

    if (!profile) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Candidate profile for user "${id}" not found.`,
      });
    }

    return profile as CandidateProfileDocument;
  }

  /**
   * PUT /users/candidates/:id/status — Toggle open_to_work flag.
   * Self-service: ERR_2001 if a non-Admin caller tries to modify another candidate.
   */
  async updateCandidateStatus(
    id: string,
    openToWork: boolean,
    callerId: string,
    callerRole: string,
  ): Promise<CandidateProfileDocument> {
    // Authorization: ADMIN can toggle any, CANDIDATE only their own
    if (callerRole !== 'ADMIN' && callerId !== id) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message: 'You are not authorized to modify another candidate\'s status.',
      });
    }

    const objectId = new Types.ObjectId(id);

    const userExists = await this.userModel.exists({ _id: objectId, role: 'CANDIDATE' });
    if (!userExists) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Candidate with ID "${id}" not found.`,
      });
    }

    const profile = await this.candidateProfileModel
      .findOneAndUpdate(
        { userId: objectId },
        { $set: { openToWork } },
        { new: true },
      )
      .lean();

    if (!profile) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Candidate profile for user "${id}" not found.`,
      });
    }

    return profile as CandidateProfileDocument;
  }

  /**
   * DELETE /users/candidates/:id — Atomically delete User + CandidateProfile
   * in a Mongoose session to prevent orphan records (Architecture Rule §4).
   */
  async deleteCandidateAccount(id: string): Promise<void> {
    const objectId = new Types.ObjectId(id);

    const user = await this.userModel.findOne({ _id: objectId, role: 'CANDIDATE' });
    if (!user) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: `Candidate with ID "${id}" not found.`,
      });
    }

    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      await this.userModel.findByIdAndDelete(objectId).session(session);
      await this.candidateProfileModel.findOneAndDelete({ userId: objectId }).session(session);

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw new InternalServerErrorException({
        errorCode: 'ERR_5001',
        message: 'Failed to delete candidate account. The operation was rolled back.',
      });
    } finally {
      session.endSession();
    }
  }
}
