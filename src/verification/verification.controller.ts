import {
  Body,
  Controller,
  Get,
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
import { VerificationService } from './verification.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockedUserGuard } from '../auth/guards/blocked-user.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// ─────────────────────────────────────────────────────────────────────────────
// Candidate-facing verification controller — Capability 3 (candidate surface).
//
//   POST /verification/submit  → submit()   (1–5 identity documents for review)
//   GET  /verification/me      → getMine()  (own verification status + documents)
//
// Both routes are candidate-only, so `@Roles(UserRole.CANDIDATE)` is applied at
// the class level (Req 7.6, 12.5). A user without the CANDIDATE role is rejected
// by `RolesGuard` with an authorization error and no document is stored.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Verification (Candidate)')
@ApiBearerAuth('access-token')
@Controller('verification')
@UseGuards(JwtAuthGuard, RolesGuard, BlockedUserGuard)
@Roles(UserRole.CANDIDATE)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  // ─── POST /verification/submit ────────────────────────────────────────────
  // Submit 1–5 identity documents; UNVERIFIED/REJECTED → PENDING_REVIEW.

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[Candidate] Submit identity documents for verification review',
    description:
      'Submits between 1 and 5 identity documents (CCCD / student card) for ' +
      'admin review. Each document must be JPEG, PNG, or PDF and at most 10 MB. ' +
      'A submission is permitted only when the candidate is UNVERIFIED or ' +
      'REJECTED; on success the status transitions to PENDING_REVIEW. Throws ' +
      'ERR_3001 if the document count/format/size is invalid (nothing stored, ' +
      'status unchanged) and ERR_4003 if the candidate is already ' +
      'PENDING_REVIEW or VERIFIED.',
  })
  @ApiResponse({ status: 201, description: 'Documents submitted; status set to PENDING_REVIEW.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (document count, format, or size).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate profile not found.' })
  @ApiResponse({ status: 409, description: 'ERR_4003 — Submission not allowed from the current verification status.' })
  submit(
    @Body() dto: SubmitVerificationDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.verificationService.submit(user.id.toString(), dto);
  }

  // ─── GET /verification/me ─────────────────────────────────────────────────
  // Read own verification status + own stored documents (self-access, Req 7.7).

  @Get('me')
  @ApiOperation({
    summary: '[Candidate] Get own verification status and submitted documents',
    description:
      'Returns the calling candidate\'s own verification view: the current ' +
      'VerificationStatus, the stored identity documents, and the relevant ' +
      'decision timestamps / rejection reason where present. Throws ERR_4001 ' +
      'if the candidate profile does not exist.',
  })
  @ApiResponse({ status: 200, description: 'Own verification status and documents returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate profile not found.' })
  getMine(@CurrentUser() user: { id: any; email: string; role: string }) {
    return this.verificationService.getMine(user.id.toString());
  }
}
