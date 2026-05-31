import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { ReportsService } from './reports.service';
import { ReportQueueDto } from './dto/report-queue.dto';
import { DismissReportDto } from './dto/dismiss-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockedUserGuard } from '../auth/guards/blocked-user.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// Admin report-moderation controller — Capability 4 (admin surface).
//
//   GET   /admin/reports               → queue()    (filterable, newest-first)
//   PATCH /admin/reports/:id/review    → review()   (OPEN → UNDER_REVIEW)
//   PATCH /admin/reports/:id/resolve   → resolve()  (block target + RESOLVED)
//   PATCH /admin/reports/:id/dismiss   → dismiss()  (→ DISMISSED + reason)
//
// The whole controller is restricted to ADMIN via class-level `@Roles`.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Admin — Report Moderation')
@ApiBearerAuth('access-token')
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard, BlockedUserGuard)
@Roles(UserRole.ADMIN)
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ─── GET /admin/reports ───────────────────────────────────────────────────
  @Get()
  @ApiOperation({
    summary: '[Admin] List the report queue (filter by status / targetType; paginated, newest-first)',
    description:
      'Returns reports ordered newest-first and paginated (default 20, max 100). ' +
      'Optionally filterable by `status` and `targetType`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated report queue returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid filter or pagination).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  queue(@Query() query: ReportQueueDto) {
    return this.reportsService.queue(query);
  }

  // ─── PATCH /admin/reports/:id/review ──────────────────────────────────────
  @Patch(':id/review')
  @ApiOperation({
    summary: '[Admin] Open a report for handling (OPEN → UNDER_REVIEW)',
    description:
      'Assigns the report to the acting admin and transitions it from OPEN to ' +
      'UNDER_REVIEW, recording the assigned admin and timestamp. Throws ERR_4001 ' +
      'if the report does not exist and ERR_2002 if it is not OPEN (already ' +
      'under review or terminal).',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the report to open for review.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Report opened for review successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Report not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Report cannot be opened from its current status.' })
  review(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.reportsService.review(id, user.id.toString());
  }

  // ─── PATCH /admin/reports/:id/resolve ─────────────────────────────────────
  @Patch(':id/resolve')
  @ApiOperation({
    summary: '[Admin] Resolve a report and block its target (→ RESOLVED)',
    description:
      'Enforces against the reported target — a JOB is closed and a USER is ' +
      'blocked — then transitions the report to RESOLVED, recording the ' +
      'resolving admin and timestamp. Throws ERR_4001 if the report or its ' +
      'referenced target no longer exists and ERR_2002 if the report is already ' +
      'RESOLVED or DISMISSED.',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the report to resolve.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Report resolved and target blocked successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Report or referenced target not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Report is already resolved or dismissed.' })
  resolve(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.reportsService.resolve(id, user.id.toString());
  }

  // ─── PATCH /admin/reports/:id/dismiss ─────────────────────────────────────
  @Patch(':id/dismiss')
  @ApiOperation({
    summary: '[Admin] Dismiss a report with a reason (→ DISMISSED)',
    description:
      'Transitions the report to DISMISSED without enforcing against its target, ' +
      'recording the dismissing admin, reason (required, max 1,000 chars), and ' +
      'timestamp. Throws ERR_4001 if the report does not exist and ERR_2002 if ' +
      'it is already RESOLVED or DISMISSED.',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the report to dismiss.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Report dismissed successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (missing/oversized reason or invalid ObjectId).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Report not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Report is already resolved or dismissed.' })
  dismiss(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: DismissReportDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.reportsService.dismiss(id, user.id.toString(), dto.reason);
  }
}
