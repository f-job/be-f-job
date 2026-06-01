import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { InterviewsService } from './interviews.service';

import { CurrentUser } from '../common/decorators/current-user.decorator';

import { UpdateInterviewDto } from './dto/update-interview.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('employers/interviews')
export class InterviewsController {
  constructor(
    private readonly service:
      InterviewsService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user,
  ) {
    return this.service.findAll(
      user.id,
    );
  }

  @Post(':id/remind')
  remind(
    @Param('id') id: string,
  ) {
    return this.service.remind(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.service.update(
      id,
      dto,
    );
  }

  @Delete(':id')
  cancel(
    @Param('id') id: string,
  ) {
    return this.service.cancel(id);
  }
}