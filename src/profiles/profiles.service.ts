import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import { Profile, ProfileDocument } from './schemas/profile.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateExperienceDto, UpdateExperienceDto } from './dto/experience.dto';
import { CreateEducationDto, UpdateEducationDto } from './dto/education.dto';
import { AddSkillDto } from './dto/skill.dto';

@Injectable()
export class ProfilesService implements OnModuleInit {
  constructor(
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  onModuleInit() {
    const directories = ['./uploads/cvs', './uploads/avatars'];
    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // Get current candidate's profile
  async getMyProfile(userId: string): Promise<ProfileDocument> {
    const profile = await this.profileModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!profile) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Profile not found.',
      });
    }
    return profile;
  }

  // Update general info (fullName, phone, address) and sync with user document
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileDocument> {
    const objectUserId = new Types.ObjectId(userId);
    const profile = await this.profileModel.findOne({ userId: objectUserId }).exec();
    if (!profile) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Profile not found.',
      });
    }

    if (dto.fullName !== undefined) {
      profile.fullName = dto.fullName;
      // Sync with users collection
      await this.userModel.findByIdAndUpdate(objectUserId, { fullName: dto.fullName }).exec();
    }
    if (dto.phone !== undefined) profile.phone = dto.phone;
    if (dto.address !== undefined) profile.address = dto.address;

    return profile.save();
  }

  // Experience Items
  async addExperience(userId: string, dto: CreateExperienceDto): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    profile.experiences.push(dto as any);
    return profile.save();
  }

  async updateExperience(userId: string, expId: string, dto: UpdateExperienceDto): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    const exp = profile.experiences.id(expId);
    if (!exp) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Experience item not found.',
      });
    }

    if (dto.role !== undefined) exp.role = dto.role;
    if (dto.companyName !== undefined) exp.companyName = dto.companyName;
    if (dto.startDate !== undefined) exp.startDate = dto.startDate;
    if (dto.endDate !== undefined) exp.endDate = dto.endDate;
    if (dto.location !== undefined) exp.location = dto.location;
    if (dto.duration !== undefined) exp.duration = dto.duration;
    if (dto.description !== undefined) exp.description = dto.description;

    return profile.save();
  }

  async deleteExperience(userId: string, expId: string): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    const exp = profile.experiences.id(expId);
    if (!exp) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Experience item not found.',
      });
    }

    profile.experiences.pull(expId);
    return profile.save();
  }

  // Education Items
  async addEducation(userId: string, dto: CreateEducationDto): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    profile.educations.push(dto as any);
    return profile.save();
  }

  async updateEducation(userId: string, eduId: string, dto: UpdateEducationDto): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    const edu = profile.educations.id(eduId);
    if (!edu) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Education item not found.',
      });
    }

    if (dto.school !== undefined) edu.school = dto.school;
    if (dto.major !== undefined) edu.major = dto.major;
    if (dto.duration !== undefined) edu.duration = dto.duration;
    if (dto.degree !== undefined) edu.degree = dto.degree;

    return profile.save();
  }

  async deleteEducation(userId: string, eduId: string): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    const edu = profile.educations.id(eduId);
    if (!edu) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Education item not found.',
      });
    }

    profile.educations.pull(eduId);
    return profile.save();
  }

  // Skills
  async addOrUpdateSkill(userId: string, dto: AddSkillDto): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    const existingSkill = profile.skills.find(
      (s) => s.name.toLowerCase() === dto.name.toLowerCase(),
    );

    if (existingSkill) {
      existingSkill.rating = dto.rating;
    } else {
      profile.skills.push(dto as any);
    }

    return profile.save();
  }

  async deleteSkill(userId: string, skillId: string): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    const skill = profile.skills.id(skillId);
    if (!skill) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Skill not found.',
      });
    }

    profile.skills.pull(skillId);
    return profile.save();
  }

  // CV Files Management
  async getFiles(userId: string) {
    const profile = await this.getMyProfile(userId);
    return profile.files;
  }

  async uploadCvFile(userId: string, file: Express.Multer.File): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    if (profile.files.length >= 3) {
      // Safely cleanup physical file since limit is exceeded
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw new BadRequestException({
        errorCode: 'ERR_4003',
        message: 'Maximum limit of 3 CV files reached.',
      });
    }

    const fileId = new Types.ObjectId();
    const isPrimary = profile.files.length === 0; // First file is set to primary

    const fileData = {
      _id: fileId,
      fileName: file.originalname,
      fileUrl: `/api/profiles/files/${fileId}/download`,
      filePath: file.path,
      fileSize: file.size,
      isPrimary,
    };

    profile.files.push(fileData as any);
    return profile.save();
  }

  async deleteCvFile(userId: string, fileId: string): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    const fileItem = profile.files.id(fileId);
    if (!fileItem) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'CV file not found.',
      });
    }

    // Delete physical file from disk
    try {
      if (fs.existsSync(fileItem.filePath)) {
        fs.unlinkSync(fileItem.filePath);
      }
    } catch (err) {
      // Suppress or log file deletion failure to not block DB sync
    }

    const wasPrimary = fileItem.isPrimary;
    profile.files.pull(fileId);

    // If we deleted the primary CV and have other CVs left, make the first one primary
    if (wasPrimary && profile.files.length > 0) {
      profile.files[0].isPrimary = true;
    }

    return profile.save();
  }

  async setPrimaryCvFile(userId: string, fileId: string): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    const fileItem = profile.files.id(fileId);
    if (!fileItem) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'CV file not found.',
      });
    }

    profile.files.forEach((f) => {
      f.isPrimary = f.id === fileId;
    });

    return profile.save();
  }

  async getCvFileForDownload(userId: string, userRole: string, fileId: string) {
    // Find the profile containing this file
    const profile = await this.profileModel.findOne({ 'files._id': new Types.ObjectId(fileId) }).exec();
    if (!profile) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'CV file not found.',
      });
    }

    // Authorization: Candidate can only download their own CV. Employer or Admin can download any.
    if (userRole === UserRole.CANDIDATE && profile.userId.toString() !== userId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message: 'You are not authorized to download this file.',
      });
    }

    const fileItem = profile.files.id(fileId);
    if (!fileItem || !fs.existsSync(fileItem.filePath)) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'CV file not found on disk.',
      });
    }

    return {
      filePath: fileItem.filePath,
      fileName: fileItem.fileName,
    };
  }

  // Avatar Upload
  async updateAvatar(userId: string, file: Express.Multer.File): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);

    // Delete old avatar from disk if exists
    if (profile.avatarUrl) {
      try {
        const parts = profile.avatarUrl.split('/');
        const oldFileName = parts[parts.length - 1];
        const oldPath = `./uploads/avatars/${oldFileName}`;
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      } catch (err) {
        // Suppress old avatar deletion issues
      }
    }

    profile.avatarUrl = `/api/profiles/avatar/${file.filename}`;
    return profile.save();
  }

  // Toggle Job Seeking Status
  async updateStatus(userId: string, openToWork: boolean): Promise<ProfileDocument> {
    const profile = await this.getMyProfile(userId);
    profile.openToWork = openToWork;
    return profile.save();
  }

  // Public Preview for Employers and Admins
  async previewProfile(candidateId: string): Promise<ProfileDocument> {
    const profile = await this.profileModel.findOne({ userId: new Types.ObjectId(candidateId) }).exec();
    if (!profile) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message: 'Candidate profile not found.',
      });
    }
    return profile;
  }
}
