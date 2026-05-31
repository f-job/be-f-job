import {
  Controller,
  Put,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockedUserGuard } from '../auth/guards/blocked-user.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// Employer-facing application lifecycle controller.
//
// Surfaces the two terminal transitions an employer can perform on an
// application that is currently in the `Accepted` state:
//
//   PUT /employers/applications/:id/complete  → markCompleted()
//   PUT /employers/applications/:id/no-show    → markNoShow()
//
// Both routes are guarded by JWT + RolesGuard and restricted to EMPLOYER.
// Ownership (the caller's EmployerProfile must own the job) is enforced inside
// ApplicationsService, which also performs the atomic guarded transition and
// appends the corresponding AuditLog entry.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Applications (Employer)')
@ApiBearerAuth('access-token')
@Controller('employers/applications')
@UseGuards(JwtAuthGuard, RolesGuard, BlockedUserGuard)
@Roles(UserRole.EMPLOYER)
export class EmployerApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // ─── PUT /employers/applications/:id/complete ─────────────────────────────
  // Mark an Accepted application as Completed (shift finished successfully).

  @Put(':id/complete')
  @ApiOperation({
    summary: '[Employer] Mark an application as Completed',
    description:
      'Transitions an application from "Accepted" to "Completed" after the ' +
      'casual shift has been fulfilled. Only the employer that owns the ' +
      'underlying job may perform this action. The transition is atomic and ' +
      'exactly-once: a non-Accepted (wrong or terminal) state yields ERR_2002. ' +
      'Completing an application unlocks the two-way review flow for both ' +
      'parties and appends an audit-log entry.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the application to mark Completed',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Application marked as Completed successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller does not own this application.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Application not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Application is not in the Accepted state.' })
  markCompleted(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.applicationsService.markCompleted(id, user.id.toString());
  }

  // ─── PUT /employers/applications/:id/no-show ──────────────────────────────
  // Report that the accepted candidate did not show up for the scheduled shift.

  @Put(':id/no-show')
  @ApiOperation({
    summary: '[Employer] Report a candidate no-show',
    description:
      'Transitions an application from "Accepted" to "NoShow" when the ' +
      'candidate failed to attend the scheduled shift. Only the employer that ' +
      'owns the underlying job may perform this action, and only after the ' +
      'scheduled time has passed (else ERR_5002). The transition is atomic and ' +
      'exactly-once: a non-Accepted (wrong or terminal) state yields ERR_2002. ' +
      'Reporting a no-show applies the candidate trust-score penalty and ' +
      'appends an audit-log entry.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the application to report as NoShow',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Application marked as NoShow successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format. | ERR_5002 — Scheduled time has not yet passed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller does not own this application.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Application not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Application is not in the Accepted state.' })
  markNoShow(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.applicationsService.markNoShow(id, user.id.toString());
  }
}
