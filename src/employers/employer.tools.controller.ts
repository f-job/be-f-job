import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { CurrentUser } from '../common/decorators/current-user.decorator';

import { BulkRejectDto } from './dto/bulk-reject.dto';
import { BulkInterviewDto } from './dto/bulk-interview.dto';

import { EmployerService } from './employers.service';

@UseGuards(AuthGuard('jwt'))
@Controller('employers')
export class EmployerToolsController {
  constructor(
    private readonly service: EmployerService,
  ) {}

  @Post('emails/bulk-reject')
  bulkReject(
    @CurrentUser() user,
    @Body() dto: BulkRejectDto,
  ) {
    return this.service.bulkReject(
      user.id,
      dto,
    );
  }

  @Post('emails/bulk-interview')
  bulkInterview(
    @CurrentUser() user,
    @Body() dto: BulkInterviewDto,
  ) {
    return this.service.bulkInterview(
      user.id,
      dto,
    );
  }

  @Get('favorites')
  getFavorites(
    @CurrentUser() user,
  ) {
    return this.service.getFavorites(
      user.id,
    );
  }

  @Post('favorites/:candidateId')
  addFavorite(
    @CurrentUser() user,
    @Param('candidateId')
    candidateId: string,
  ) {
    return this.service.addFavorite(
      user.id,
      candidateId,
    );
  }

  @Delete('favorites/:candidateId')
  removeFavorite(
    @CurrentUser() user,
    @Param('candidateId')
    candidateId: string,
  ) {
    return this.service.removeFavorite(
      user.id,
      candidateId,
    );
  }
}