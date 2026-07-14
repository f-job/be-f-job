import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { EmployerService } from './employers.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Employer Candidates')
@ApiBearerAuth('access-token')


@UseGuards(AuthGuard('jwt'))
@Controller('employers')
export class EmployerCandidatesController {
  constructor(private readonly service: EmployerService) { }

  @Get('candidates')
  search(@Query() query: any) {
    return this.service.searchCandidates(query);
  }

  @Get('candidates/:id')
  getOne(@Param('id') id: string) {
    return this.service.getCandidate(id);
  }

  @Get('candidates/:id/download-cv')
  download(
    @Req() req,
    @Param('id') id: string,
  ) {
    return this.service.downloadCV(req.user.id, id);
  }

  @Post('candidates/:id/unlock')
  unlock(
    @Req() req,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.service.unlockCandidate(req.user.id, id);
  }

  @Get('ats/:applicationId')
  ats(@Param('applicationId') id: string) {
    return this.service.getATS(id);
  }
}
