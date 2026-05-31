import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminJobsService } from './admin-jobs.service';
import { AdminJobsQueryDto } from './dto/admin-jobs-query.dto';
import { RejectJobDto } from './dto/reject-job.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// !! ROUTING ORDER SAFEGUARD !!
// Static literal "pending" MUST be declared before the dynamic /:id route so
// NestJS does not capture "pending" as an :id value.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Admin — Job Moderation')
@ApiBearerAuth('access-token')
@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminJobsController {
  constructor(private readonly service: AdminJobsService) {}

  // ─── GET /admin/jobs/pending ──────────────────────────────────────────────
  @Get('pending')
  @ApiOperation({ summary: '[Admin] List jobs awaiting approval (pending queue)' })
  @ApiResponse({ status: 200, description: 'Paginated pending job list.' })
  findPending(@Query() query: AdminJobsQueryDto) {
    return this.service.findPending(query);
  }

  // ─── GET /admin/jobs ──────────────────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: '[Admin] List all jobs (optional ?status filter)' })
  @ApiResponse({ status: 200, description: 'Paginated job list.' })
  findAll(@Query() query: AdminJobsQueryDto) {
    return this.service.findAll(query);
  }

  // ─── GET /admin/jobs/:id ──────────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get a job detail for moderation' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the job' })
  @ApiResponse({ status: 200, description: 'Job detail returned.' })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.service.findOne(id);
  }

  // ─── PUT /admin/jobs/:id/approve ──────────────────────────────────────────
  @Put(':id/approve')
  @ApiOperation({ summary: '[Admin] Approve a pending job (pending → active)' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the job' })
  @ApiResponse({ status: 200, description: 'Job approved and now active.' })
  @ApiResponse({ status: 400, description: 'Job is not in pending status.' })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  approve(@Param('id', ParseObjectIdPipe) id: string) {
    return this.service.approve(id);
  }

  // ─── PUT /admin/jobs/:id/reject ───────────────────────────────────────────
  @Put(':id/reject')
  @ApiOperation({ summary: '[Admin] Reject a pending job with a reason (pending → draft)' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the job' })
  @ApiResponse({ status: 200, description: 'Job rejected; returned to employer as draft.' })
  @ApiResponse({ status: 400, description: 'Job is not in pending status.' })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: RejectJobDto,
  ) {
    return this.service.reject(id, dto.reason);
  }

  // ─── PUT /admin/jobs/:id/hide ─────────────────────────────────────────────
  @Put(':id/hide')
  @ApiOperation({ summary: '[Admin] Hide / take down a job for violations (→ closed)' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the job' })
  @ApiResponse({ status: 200, description: 'Job hidden (closed).' })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  hide(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: RejectJobDto,
  ) {
    return this.service.hide(id, dto.reason);
  }
}
