import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
  Interview,
  InterviewDocument,
  InterviewStatus,
} from './schemas/interview.schema';

import { EmployerProfile } from '../employers/schemas/employer-profile.schema';

import { UpdateInterviewDto } from './dto/update-interview.dto';

@Injectable()
export class InterviewsService {
  constructor(
    @InjectModel(Interview.name)
    private readonly interviewModel: Model<InterviewDocument>,

    @InjectModel(EmployerProfile.name)
    private readonly employerModel: Model<EmployerProfile>,
  ) {}

  async findAll(userId: string) {
    const employer = await this.employerModel.findOne({
      userId,
    });

    if (!employer) {
      throw new NotFoundException(
        'Employer not found',
      );
    }

    return this.interviewModel
      .find({
        employerId: employer._id,
      })
      .populate('candidateId')
      .populate('applicationId')
      .sort({
        scheduledAt: 1,
      });
  }

  async remind(id: string) {
    const interview =
      await this.interviewModel.findById(id);

    if (!interview) {
      throw new NotFoundException(
        'Interview not found',
      );
    }

    // TODO: Send reminder email

    return {
      message:
        'Reminder sent successfully',
    };
  }

  async update(
    id: string,
    dto: UpdateInterviewDto,
  ) {
    const interview =
      await this.interviewModel.findByIdAndUpdate(
        id,
        {
          $set: {
            ...dto,
            ...(dto.scheduledAt && {
              scheduledAt: new Date(
                dto.scheduledAt,
              ),
            }),
          },
        },
        {
          new: true,
        },
      );

    if (!interview) {
      throw new NotFoundException(
        'Interview not found',
      );
    }

    return interview;
  }

  async cancel(id: string) {
    const interview =
      await this.interviewModel.findByIdAndUpdate(
        id,
        {
          status:
            InterviewStatus.CANCELLED,
        },
        {
          new: true,
        },
      );

    if (!interview) {
      throw new NotFoundException(
        'Interview not found',
      );
    }

    // TODO: Send cancellation email

    return interview;
  }
}
