import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReferralsService }          from './referrals.service';
import { ApplyReferralDto }          from './dto/apply-referral.dto';
import { QueryReferralHistoryDto }   from './dto/query-referral-history.dto';
import { JwtAuthGuard }             from '../auth/guards/jwt-auth.guard';
import { RolesGuard }               from '../auth/guards/roles.guard';
import { Roles }                    from '../auth/decorators/roles.decorator';
import { CurrentUser }              from '../common/decorators/current-user.decorator';
import { UserRole }                 from '../users/schemas/user.schema';

// ─────────────────────────────────────────────────────────────────────────────
// !! ROUTING ORDER NOTE !!
//
// All routes in this controller are static string paths — no dynamic /:id
// segments exist here, so collision risk is minimal.  The @Roles guard on
// POST /apply restricts that endpoint to CANDIDATE role only.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Referrals')
@ApiBearerAuth('access-token')
@Controller('referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  // ─── 1. POST /referrals/apply ──────────────────────────────────────────────
  // Restricted to CANDIDATE role per business rule decision.

  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({
    summary:     'Apply a referral code',
    description:
      'Applies a friend\'s referral code to the calling CANDIDATE account. ' +
      'This atomically credits the referrer\'s reward wallet and creates a ' +
      'permanent referral log entry. ' +
      'Guards: ERR_4012 (self-referral), ERR_4011 (already referred), ' +
      'ERR_4010 (code not found). ' +
      'Only callable by users with the CANDIDATE role.',
  })
  @ApiResponse({
    status:      201,
    description: 'Referral code applied successfully. Referrer has been rewarded.',
    schema: {
      example: {
        message:      'Referral code applied successfully. Your referrer has been rewarded.',
        rewardAmount: 50000,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'ERR_3010 — Validation error (invalid payload format).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_4012 — Self-referral attempt, or wrong role.' })
  @ApiResponse({ status: 404, description: 'ERR_4010 — Referral code not found.' })
  @ApiResponse({ status: 409, description: 'ERR_4011 — User has already applied a referral code.' })
  applyReferralCode(
    @Body()         dto:  ApplyReferralDto,
    @CurrentUser()  user: { id: any },
  ) {
    return this.referralsService.applyReferralCode(user.id.toString(), dto);
  }

  // ─── 2. GET /referrals/my ─────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({
    summary:     'Get own referral info',
    description:
      'Returns the calling user\'s unique referral code (generating it lazily ' +
      'if not yet assigned), a shareable invite URL constructed from the ' +
      'APP_FRONTEND_URL environment variable, and a campaign summary ' +
      '(total referrals made, total rewards earned).',
  })
  @ApiResponse({
    status:      200,
    description: 'Referral info returned successfully.',
    schema: {
      example: {
        referralCode:   'FJOB-A1B2C3D4',
        inviteUrl:      'https://f-job.app/register?ref=FJOB-A1B2C3D4',
        totalReferrals: 3,
        totalEarned:    150000,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  getMyReferralInfo(@CurrentUser() user: { id: any }) {
    return this.referralsService.getMyReferralInfo(user.id.toString());
  }

  // ─── 3. GET /referrals/history ────────────────────────────────────────────

  @Get('history')
  @ApiOperation({
    summary:     'Get referral history',
    description:
      'Returns a paginated, newest-first log of all successful referrals where ' +
      'the calling user was the referrer. Each record includes the referee\'s ' +
      'basic profile, the reward amount credited, and the referral status.',
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status:      200,
    description: 'Referral history returned successfully.',
    schema: {
      example: {
        data: [
          {
            _id:          '665f1a2b3c4d5e6f7a8b9c0d',
            refereeId:    { fullName: 'Nguyen Van B', email: 'b@example.com' },
            rewardAmount: 50000,
            status:       'credited',
            createdAt:    '2026-05-01T10:00:00.000Z',
          },
        ],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  getReferralHistory(
    @CurrentUser()  user:  { id: any },
    @Query()        query: QueryReferralHistoryDto,
  ) {
    return this.referralsService.getReferralHistory(user.id.toString(), query);
  }

  // ─── 4. GET /referrals/balance ────────────────────────────────────────────

  @Get('balance')
  @ApiOperation({
    summary:     'Get referral wallet balance',
    description:
      'Returns the current accumulated referral wallet balance (in VND) for ' +
      'the authenticated user. This balance is the total of all reward credits ' +
      'received from successful referrals.',
  })
  @ApiResponse({
    status:      200,
    description: 'Balance returned successfully.',
    schema: {
      example: { referralBalance: 150000 },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  getReferralBalance(@CurrentUser() user: { id: any }) {
    return this.referralsService.getReferralBalance(user.id.toString());
  }
}
