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
import { VerificationService } from './verification.service';
import { VerificationQueueDto } from './dto/verification-queue.dto';
import { RejectVerificationDto } from './dto/reject-verification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockedUserGuard } from '../auth/guards/blocked-user.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// Admin verification-review controller — Capability 3 (admin surface).
//
//   GET   /admin/verifications              → queue()        (PENDING_REVIEW queue)
//   GET   /admin/verifications/:userId      → getDocuments()  (candidate's documents)
//   PATCH /admin/verifications/:userId/approve → approve()    (PENDING_REVIEW → VERIFIED)
//   PATCH /admin/verifications/:userId/reject  → reject()     (PENDING_REVIEW → REJECTED)
//
// The whole controller is restricted to ADMIN via class-level `@Roles` (Req 8.5,
// 12.3). `getDocuments` additionally receives the requester's id + role from the
// JWT so the service can enforce its admin-OR-owner read rule (Req 7.7).
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Admin — Verification Review')
@ApiBearerAuth('access-token')
@Controller('admin/verifications')
@UseGuards(JwtAuthGuard, RolesGuard, BlockedUserGuard)
@Roles(UserRole.ADMIN)
export class AdminVerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  // ─── GET /admin/verifications ─────────────────────────────────────────────
  @Get()
  @ApiOperation({
    summary: '[Admin] List the candidate verification queue (oldest-first)',
    description:
      'Returns the candidates whose VerificationStatus is PENDING_REVIEW, ' +
      'ordered by the time each entered the queue from oldest to newest, ' +
      'paginated with a 1-indexed page (default 1) and a limit defaulting to 20 ' +
      'and capped at 100. A page below 1 or a limit above 100 is rejected with ' +
      'ERR_3001.',
  })
  @ApiResponse({ status: 200, description: 'Paginated verification queue returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid page or limit).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  queue(@Query() query: VerificationQueueDto) {
    return this.verificationService.queue(query.page ?? 1, query.limit ?? 20);
  }

  // ─── GET /admin/verifications/:userId ─────────────────────────────────────
  @Get(':userId')
  @ApiOperation({
    summary: "[Admin] Read a candidate's submitted identity documents for review",
    description:
      "Returns the candidate's stored identity documents for review. Read " +
      'access is restricted to admins and the owning candidate; any other ' +
      'requester is rejected with ERR_2001. Throws ERR_4001 if the candidate ' +
      'profile does not exist.',
  })
  @ApiParam({
    name: 'userId',
    description: 'MongoDB ObjectId of the candidate (User._id) whose documents to read.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Candidate identity documents returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller may not view these documents.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate profile not found.' })
  getDocuments(
    @Param('userId', ParseObjectIdPipe) userId: string,
    @CurrentUser() user: { id: any; email: string; role: UserRole },
  ) {
    return this.verificationService.getDocuments(
      userId,
      user.id.toString(),
      user.role,
    );
  }

  // ─── PATCH /admin/verifications/:userId/approve ───────────────────────────
  @Patch(':userId/approve')
  @ApiOperation({
    summary: '[Admin] Approve a candidate verification (PENDING_REVIEW → VERIFIED)',
    description:
      "Approves a candidate whose VerificationStatus is PENDING_REVIEW, setting " +
      'it to VERIFIED and recording the approving admin and approval timestamp. ' +
      'Notifies the candidate and appends an audit-log entry. Throws ERR_2002 if ' +
      'the candidate is not in PENDING_REVIEW (status unchanged) and ERR_4001 if ' +
      'the candidate profile does not exist.',
  })
  @ApiParam({
    name: 'userId',
    description: 'MongoDB ObjectId of the candidate (User._id) to approve.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Candidate verification approved (VERIFIED).' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate profile not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Candidate is not in PENDING_REVIEW.' })
  approve(
    @Param('userId', ParseObjectIdPipe) userId: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.verificationService.approve(userId, user.id.toString());
  }

  // ─── PATCH /admin/verifications/:userId/reject ────────────────────────────
  @Patch(':userId/reject')
  @ApiOperation({
    summary: '[Admin] Reject a candidate verification (PENDING_REVIEW → REJECTED)',
    description:
      "Rejects a candidate whose VerificationStatus is PENDING_REVIEW with a " +
      'reason of at most 1,000 characters, setting it to REJECTED and recording ' +
      'the rejecting admin, reason, and rejection timestamp. Notifies the ' +
      'candidate and appends an audit-log entry. Throws ERR_3001 if the reason ' +
      'is missing or oversized, ERR_2002 if the candidate is not in ' +
      'PENDING_REVIEW (status unchanged), and ERR_4001 if the candidate profile ' +
      'does not exist.',
  })
  @ApiParam({
    name: 'userId',
    description: 'MongoDB ObjectId of the candidate (User._id) to reject.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Candidate verification rejected (REJECTED).' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (missing or oversized reason; invalid ObjectId).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate profile not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Candidate is not in PENDING_REVIEW.' })
  reject(
    @Param('userId', ParseObjectIdPipe) userId: string,
    @Body() dto: RejectVerificationDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.verificationService.reject(userId, user.id.toString(), dto.reason);
  }
}
