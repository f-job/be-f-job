import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole, UserStatus } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel.find().skip(skip).limit(limit).lean(),
      this.userModel.countDocuments(),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).lean();
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user as UserDocument;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password +refreshTokenHash')
      .exec();
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, dto, { new: true })
      .lean();

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user as UserDocument;
  }

  async remove(id: string): Promise<void> {
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
  }

  async setUserStatus(id: string, status: UserStatus): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .lean();

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user as UserDocument;
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
  }): Promise<UserDocument> {
    const user = new this.userModel(data);
    return user.save();
  }
}
