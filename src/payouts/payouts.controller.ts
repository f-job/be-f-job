import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PayoutsService }            from './payouts.service';
import { RequestPayoutDto }          from './dto/request-payout.dto';
import { UpdatePayoutSettingsDto }   from './dto/update-payout-settings.dto';
import { QueryPayoutsDto }           from './dto/query-payouts.dto';
import { DevSimulatePayoutDto }      from './dto/dev-simulate-payout.dto';
import { JwtAuthGuard }             from '../auth/guards/jwt-auth.guard';
import { RolesGuard }               from '../auth/guards/roles.guard';
import { CurrentUser }              from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe }        from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// !! ROUTING ORDER SAFEGUARD — CRITICAL !!
//
// NestJS resolves routes in the order they are declared in the controller.
// String literal "my", "settings", and "validate" MUST appear as registered
// routes BEFORE the dynamic /:id wildcard, or NestJS will capture those
// strings as the :id parameter value and route to the wrong handler.
//
// ENFORCED DECLARATION ORDER:
//
//   STATIC routes (registered first)
//   ─────────────────────────────────────────────────────
//   1.  POST   /payouts/request                → requestPayout()
//   2.  GET    /payouts/my                     → getMyPayouts()
//   3.  GET    /payouts/my/settings            → getPayoutSettings()
//   4.  PUT    /payouts/my/settings            → upsertPayoutSettings()
//   5.  GET    /payouts/my/settings/validate   → validatePayoutEligibility()
//
//   DEV-ONLY route (static path, no auth restriction — for testing only)
//   ─────────────────────────────────────────────────────
//   6.  PATCH  /payouts/dev/simulate/:id       → devSimulatePayoutStatus()
//
//   DYNAMIC route (registered last)
//   ─────────────────────────────────────────────────────
//   7.  GET    /payouts/my/:id                 → getPayoutById()
//
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Payouts')
@ApiBearerAuth('access-token')
@Controller('payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  // ─── 1. POST /payouts/request ─────────────────────────────────────────────
  // STATIC route — registered first.

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:     'Create a payout request',
    description:
      'Submits a new withdrawal request for the authenticated user. ' +
      'Prerequisites: bank settings must be configured via PUT /payouts/my/settings. ' +
      'The requested amount must be >= 50,000 VND. ' +
      'The bank account details are snapshotted at request time for record integrity. ' +
      'The request enters the system in PENDING status awaiting admin review.',
  })
  @ApiResponse({
    status:      201,
    description: 'Payout request created successfully.',
    schema: {
      example: {
        _id:     '665f1a2b3c4d5e6f7a8b9c0d',
        userId:  '665f1a2b3c4d5e6f7a8b9c01',
        amount:  200000,
        bankInfo: {
          bankName:          'Vietcombank',
          accountNumber:     '0123456789',
          accountHolderName: 'NGUYEN VAN A',
        },
        status:        'pending',
        transactionId: null,
        adminNote:     null,
        processedAt:   null,
        createdAt:     '2026-05-29T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'ERR_4014 — Bank settings not configured; ERR_3010 — Amount below minimum.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  requestPayout(
    @Body()        dto:  RequestPayoutDto,
    @CurrentUser() user: { id: any },
  ) {
    return this.payoutsService.requestPayout(user.id.toString(), dto);
  }

  // ─── 2. GET /payouts/my ──────────────────────────────────────────────────
  // STATIC route — must precede /my/:id.

  @Get('my')
  @ApiOperation({
    summary:     'List own payout requests',
    description:
      'Returns a paginated, newest-first list of all payout requests ' +
      'submitted by the authenticated user. Supports page and limit query params.',
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Payout list returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  getMyPayouts(
    @CurrentUser() user:  { id: any },
    @Query()       query: QueryPayoutsDto,
  ) {
    return this.payoutsService.getMyPayouts(user.id.toString(), query);
  }

  // ─── 3. GET /payouts/my/settings ─────────────────────────────────────────
  // STATIC route — must precede /my/:id.

  @Get('my/settings')
  @ApiOperation({
    summary:     'Get bank payout settings',
    description:
      'Returns the authenticated user\'s current saved bank account settings. ' +
      'Returns null if no settings have been configured yet.',
  })
  @ApiResponse({
    status:      200,
    description: 'Payout settings returned (or null if not yet configured).',
    schema: {
      example: {
        _id:               '665f1a2b3c4d5e6f7a8b9c0e',
        userId:            '665f1a2b3c4d5e6f7a8b9c01',
        bankName:          'Vietcombank',
        accountNumber:     '0123456789',
        accountHolderName: 'NGUYEN VAN A',
        updatedAt:         '2026-05-29T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  getPayoutSettings(@CurrentUser() user: { id: any }) {
    return this.payoutsService.getPayoutSettings(user.id.toString());
  }

  // ─── 4. PUT /payouts/my/settings ─────────────────────────────────────────
  // STATIC route — must precede /my/:id.

  @Put('my/settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:     'Create or update bank payout settings',
    description:
      'Creates or fully replaces the authenticated user\'s bank account ' +
      'details used for payout processing. All three fields (bankName, ' +
      'accountNumber, accountHolderName) are required on every call. ' +
      'Uses upsert internally — no separate creation step is needed.',
  })
  @ApiResponse({
    status:      200,
    description: 'Payout settings updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'ERR_3010 — Validation error (missing or invalid fields).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  upsertPayoutSettings(
    @Body()        dto:  UpdatePayoutSettingsDto,
    @CurrentUser() user: { id: any },
  ) {
    return this.payoutsService.upsertPayoutSettings(user.id.toString(), dto);
  }

  // ─── 5. GET /payouts/my/settings/validate ────────────────────────────────
  // STATIC route — must precede /my/:id.

  @Get('my/settings/validate')
  @ApiOperation({
    summary:     'Validate payout eligibility',
    description:
      'Pre-flight check that confirms whether the authenticated user can ' +
      'submit a payout request. Returns a structured report indicating: ' +
      '(1) whether bank settings are configured, ' +
      '(2) whether the referral balance meets the minimum threshold (50,000 VND), ' +
      'and (3) a human-readable reason if ineligible. ' +
      'This endpoint is read-only and does not modify any state.',
  })
  @ApiResponse({
    status:      200,
    description: 'Eligibility check result returned.',
    schema: {
      example: {
        eligible:        true,
        referralBalance: 150000,
        minimumAmount:   50000,
        hasSettings:     true,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  validatePayoutEligibility(@CurrentUser() user: { id: any }) {
    return this.payoutsService.validatePayoutEligibility(user.id.toString());
  }

  // ─── 6. PATCH /payouts/dev/simulate/:id ──────────────────────────────────
  // STATIC prefix ("dev/simulate") — registered before the plain /my/:id wildcard.
  // ⚠️  DEV & QA TESTING ONLY — Remove or add IP restriction before go-live.

  @Patch('dev/simulate/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:     '[DEV] Simulate payout status transition',
    description:
      '⚠️  DEVELOPER / QA USE ONLY. ⚠️  ' +
      'Force-transitions a payout document to any target status without ' +
      'requiring admin panel interaction. Used for Postman integration testing ' +
      'while the Admin Panel (Module 12) is pending implementation. ' +
      'Sets `processedAt` automatically when transitioning to COMPLETED or REJECTED. ' +
      'Remove or restrict this route before deploying to production.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the payout to update.',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({
    status:      200,
    description: 'Payout status updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid status value.' })
  @ApiResponse({ status: 404, description: 'ERR_4013 — Payout not found.' })
  devSimulatePayoutStatus(
    @Param('id', ParseObjectIdPipe) id:  string,
    @Body()                         dto: DevSimulatePayoutDto,
  ) {
    return this.payoutsService._devSimulatePayoutStatus(id, dto);
  }

  // ─── 7. GET /payouts/my/:id ───────────────────────────────────────────────
  // DYNAMIC route — MUST be declared LAST to avoid capturing static segments
  // like "settings" or "validate" as the :id parameter value.

  @Get('my/:id')
  @ApiOperation({
    summary:     'Get payout details by ID',
    description:
      'Returns full details of a specific payout request owned by the ' +
      'authenticated user. ' +
      'Throws ERR_4013 if the payout does not exist. ' +
      'Throws ERR_2010 if the caller does not own the payout record.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the payout request.',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Payout details returned successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2010 — Caller does not own this payout.' })
  @ApiResponse({ status: 404, description: 'ERR_4013 — Payout not found.' })
  getPayoutById(
    @Param('id', ParseObjectIdPipe) id:   string,
    @CurrentUser()                  user: { id: any },
  ) {
    return this.payoutsService.getPayoutById(user.id.toString(), id);
  }
}
