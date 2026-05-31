import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockedUserGuard } from '../auth/guards/blocked-user.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// Reviews controller — public/authenticated surfaces for Capability 1.
//
// This controller intentionally declares NO `@Controller(prefix)` so the three
// routes it owns map to two distinct base paths without colliding:
//
//   POST /reviews                  → create()           (Reviewer: CANDIDATE | EMPLOYER)
//   GET  /reviews                  → listForReviewee()   (any authenticated user)
//   GET  /profiles/:userId/trust   → getTrust()          (any authenticated user)
//
// Authorization model (verified against auth/guards/roles.guard.ts):
//   RolesGuard returns `true` whenever a handler/class carries NO `@Roles`
//   metadata (i.e. `requiredRoles` is empty/undefined). Therefore applying
//   `@Roles(...)` ONLY on `POST /reviews` restricts creation to candidates and
//   employers, while the two GET routes — having no `@Roles` — are open to ANY
//   authenticated role (ADMIN/USER/CANDIDATE/EMPLOYER). Applying a class-level
//   `@Roles(CANDIDATE, EMPLOYER)` would have wrongly blocked ADMIN/USER reads,
//   so role gating is done per-method here.
//
//   `GET /profiles/:userId/trust` lives on the `profiles/...` base path but does
//   NOT collide with `ProfilesController` (`@Controller('profiles')`), whose
//   dynamic routes are all sub-paths such as `profiles/preview/:candidateId`,
//   `profiles/my`, `profiles/files/...` — none of which match `:userId/trust`.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Reviews & Trust')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, BlockedUserGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ─── POST /reviews ────────────────────────────────────────────────────────
  // Leave a review for a Completed application (reviewer = candidate | employer).

  @Post('reviews')
  @Roles(UserRole.CANDIDATE, UserRole.EMPLOYER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[Candidate / Employer] Leave a review for a Completed application',
    description:
      'Creates a review for the counterparty after the referenced application ' +
      'has reached the "Completed" status. The review direction and the ' +
      'reviewee are resolved server-side from the application and the ' +
      'authenticated reviewer. Throws ERR_5001 if the application is not ' +
      'Completed, ERR_2001 if the caller is neither the application candidate ' +
      'nor the job-owning employer, ERR_4001 if the application does not exist, ' +
      'and ERR_4002 if the reviewer has already reviewed this application.',
  })
  @ApiResponse({ status: 201, description: 'Review created successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error. | ERR_5001 — Application is not Completed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller is not a participant of this application.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Application not found.' })
  @ApiResponse({ status: 409, description: 'ERR_4002 — A review already exists for this application and direction.' })
  create(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.reviewsService.create(user.id.toString(), dto);
  }

  // ─── GET /reviews ─────────────────────────────────────────────────────────
  // List a reviewee's visible reviews, newest-first, paginated (any auth role).

  @Get('reviews')
  @ApiOperation({
    summary: "[Any authenticated user] List a reviewee's visible reviews",
    description:
      "Returns the reviewee's currently-visible reviews ordered newest-first, " +
      'paginated with a 1-indexed page (default 1) and a limit defaulting to 10 ' +
      'and capped at 100. A page below 1 or a limit above 100 is rejected with ' +
      'ERR_3001. Hidden (moderated) reviews are excluded.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of visible reviews returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid revieweeId, page, or limit).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  listForReviewee(@Query() query: ReviewQueryDto) {
    return this.reviewsService.listForReviewee(
      query.revieweeId,
      query.page ?? 1,
      query.limit ?? 10,
    );
  }

  // ─── GET /profiles/:userId/trust ──────────────────────────────────────────
  // Read a profile's trust aggregates (any authenticated role).

  @Get('profiles/:userId/trust')
  @ApiOperation({
    summary: "[Any authenticated user] Get a profile's trust aggregates",
    description:
      'Returns the persisted trust aggregates and the composed verified badge ' +
      'for the given user: { trustScore, averageRating, reviewCount, ' +
      'provisional, verified }. A reviewee with no visible reviews returns ' +
      'zeroed aggregates. `verified` is true when the candidate is VERIFIED or ' +
      'the employer profile is APPROVED (either, if the user holds both). ' +
      'Throws ERR_4001 if no candidate or employer profile exists for the user.',
  })
  @ApiParam({
    name: 'userId',
    description: 'MongoDB ObjectId of the profile owner (User._id).',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Trust aggregates returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — No profile found for the given user.' })
  getTrust(@Param('userId', ParseObjectIdPipe) userId: string) {
    return this.reviewsService.getTrust(userId);
  }
}
