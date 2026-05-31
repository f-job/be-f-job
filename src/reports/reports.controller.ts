import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockedUserGuard } from '../auth/guards/blocked-user.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// ─────────────────────────────────────────────────────────────────────────────
// Reporter-facing reports controller — Capability 4 (reporter surface).
//
//   POST /reports → create()   (any authenticated user)
//
// Authorization model (verified against auth/guards/roles.guard.ts):
//   RolesGuard returns `true` whenever a handler/class carries NO `@Roles`
//   metadata (i.e. `requiredRoles` is empty/undefined). This controller
//   intentionally declares NO `@Roles` so that ANY authenticated role
//   (ADMIN/USER/CANDIDATE/EMPLOYER) may file a report (Req 10.1). The
//   JwtAuthGuard still enforces a valid JWT session (Req 12.1).
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, BlockedUserGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ─── POST /reports ────────────────────────────────────────────────────────
  // File a report against a JOB posting or another USER (any authenticated user).

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[Any authenticated user] File a report against a JOB or USER',
    description:
      'Submits a report about a fake/scam job or an abusive user. The reporter ' +
      'identity is taken from the authenticated JWT, never the body. New reports ' +
      'are persisted with status OPEN and trigger an admin notification. Throws ' +
      'ERR_5003 if a user reports their own account, ERR_4001 if the target job ' +
      'or user does not exist, and ERR_4002 if the reporter already has an active ' +
      '(OPEN/UNDER_REVIEW) report for the same target.',
  })
  @ApiResponse({ status: 201, description: 'Report filed successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid payload). | ERR_5003 — Cannot report your own account.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Target job or user not found.' })
  @ApiResponse({ status: 409, description: 'ERR_4002 — An active report for this target already exists.' })
  create(
    @Body() dto: CreateReportDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.reportsService.create(user.id.toString(), dto);
  }
}
