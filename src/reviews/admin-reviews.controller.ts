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
import { ReviewsService } from './reviews.service';
import { AdminReviewQueryDto } from './dto/admin-review-query.dto';
import { HideReviewDto } from './dto/hide-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockedUserGuard } from '../auth/guards/blocked-user.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// Admin review-moderation controller — Capability 1 (admin surface).
//
//   GET   /admin/reviews              → adminList()  (queue incl. hidden reviews)
//   PATCH /admin/reviews/:id/hide     → hide()       (visible → hidden + reason)
//   PATCH /admin/reviews/:id/restore  → restore()    (hidden → visible)
//
// The whole controller is restricted to ADMIN via class-level `@Roles`.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Admin — Review Moderation')
@ApiBearerAuth('access-token')
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard, BlockedUserGuard)
@Roles(UserRole.ADMIN)
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ─── GET /admin/reviews ───────────────────────────────────────────────────
  @Get()
  @ApiOperation({
    summary: '[Admin] List reviews for moderation (includes hidden reviews)',
    description:
      'Returns reviews for moderation, including hidden ones, newest-first and ' +
      'paginated (default 20, max 100). Optionally filterable by `revieweeId` ' +
      'and visibility (`hidden`).',
  })
  @ApiResponse({ status: 200, description: 'Paginated moderation list returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  adminList(@Query() query: AdminReviewQueryDto) {
    return this.reviewsService.adminList(query);
  }

  // ─── PATCH /admin/reviews/:id/hide ────────────────────────────────────────
  @Patch(':id/hide')
  @ApiOperation({
    summary: '[Admin] Hide a visible review with a moderation reason',
    description:
      'Marks a currently-visible review as hidden and records the moderating ' +
      'admin, reason (required, max 1,000 chars), and timestamp; recalculates ' +
      "the reviewee's trust aggregates from the reduced visible set. Throws " +
      'ERR_4001 if the review does not exist and ERR_2002 if it is already hidden.',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the review to hide.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Review hidden successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (missing/oversized reason or invalid ObjectId).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Review not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Review is already hidden.' })
  hide(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: HideReviewDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.reviewsService.hide(id, user.id.toString(), dto.reason);
  }

  // ─── PATCH /admin/reviews/:id/restore ─────────────────────────────────────
  @Patch(':id/restore')
  @ApiOperation({
    summary: '[Admin] Restore a hidden review',
    description:
      'Marks a currently-hidden review as visible and records the restoring ' +
      "admin and timestamp; recalculates the reviewee's trust aggregates from " +
      'the enlarged visible set. Throws ERR_4001 if the review does not exist ' +
      'and ERR_2002 if it is already visible.',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the review to restore.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Review restored successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Review not found.' })
  @ApiResponse({ status: 409, description: 'ERR_2002 — Review is already visible.' })
  restore(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.reviewsService.restore(id, user.id.toString());
  }
}
