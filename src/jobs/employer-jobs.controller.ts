import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { EmployerJobsService } from './employer-jobs.service';
import { CreateEmployerJobDto } from './dto/create-employer-job.dto';
import { UpdateEmployerJobDto } from './dto/update-employer-job.dto';
import { EmployerJobsQueryDto } from './dto/employer-jobs-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@UseGuards(AuthGuard('jwt')) // ✅ GẮN Ở ĐÂY
@Controller('employers/jobs')
export class EmployerJobsController {
    constructor(
        private readonly service: EmployerJobsService,
    ) { }

    @Post()
    create(
        @CurrentUser() user,
        @Body() dto: CreateEmployerJobDto,
    ) {
        return this.service.create(user.id, dto);
    }

    @Get()
    findAll(
        @CurrentUser() user,
        @Query() query: EmployerJobsQueryDto,
    ) {
        return this.service.findAll(user.id, query);
    }

    @Get(':id')
    findOne(
        @CurrentUser() user,
        @Param('id', ParseObjectIdPipe) id: string,
    ) {
        return this.service.findOne(user.id, id);
    }

    @Put(':id')
    update(
        @CurrentUser() user,
        @Param('id', ParseObjectIdPipe) id: string,
        @Body() dto: UpdateEmployerJobDto,
    ) {
        return this.service.update(user.id, id, dto);
    }

    @Delete(':id')
    remove(
        @CurrentUser() user,
        @Param('id', ParseObjectIdPipe) id: string,
    ) {
        return this.service.remove(user.id, id);
    }

    // ─────────────────────────────────────────────
    // REFRESH JOB (trừ credit)
    // POST /employers/jobs/:id/refresh
    // ─────────────────────────────────────────────
    @Post(':id/refresh')
    refresh(
        @CurrentUser() user,
        @Param('id', ParseObjectIdPipe) id: string,
    ) {
        return this.service.refresh(user.id, id);
    }

    // ─────────────────────────────────────────────
    // DUPLICATE JOB
    // POST /employers/jobs/:id/duplicate
    // ─────────────────────────────────────────────
    @Post(':id/duplicate')
    duplicate(
        @CurrentUser() user,
        @Param('id', ParseObjectIdPipe) id: string,
    ) {
        return this.service.duplicate(user.id, id);
    }

    // ─────────────────────────────────────────────
    // CLOSE JOB
    // PUT /employers/jobs/:id/close
    // ─────────────────────────────────────────────
    @Put(':id/close')
    close(
        @CurrentUser() user,
        @Param('id', ParseObjectIdPipe) id: string,
    ) {
        return this.service.close(user.id, id);
    }

    // ─────────────────────────────────────────────
    // EXTEND JOB
    // PUT /employers/jobs/:id/extend
    // ─────────────────────────────────────────────
    @Put(':id/extend')
    extend(
        @CurrentUser() user,
        @Param('id', ParseObjectIdPipe) id: string,
    ) {
        return this.service.extend(user.id, id);
    }

    // ─────────────────────────────────────────────
    // APPLICATIONS LIST
    // GET /employers/jobs/:id/applications
    // ─────────────────────────────────────────────
    @Get(':id/applications')
    getApplications(
        @CurrentUser() user,
        @Param('id', ParseObjectIdPipe) id: string,
    ) {
        return this.service.getApplications(user.id, id);
    }

}
