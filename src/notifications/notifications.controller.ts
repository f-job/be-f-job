import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Body,
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
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// !! ROUTING ORDER SAFEGUARD !!
//
// NestJS resolves routes in the order they are declared.
// Static literal paths MUST appear before dynamic /:id segments or NestJS will
// try to parse string literals (e.g. "unread-count", "read-all", "settings")
// as MongoDB ObjectIds, causing 400 / Bad Request failures on every call.
//
// Enforced declaration order in this controller:
//
//   STATIC routes (top)
//   ──────────────────────────────────────────────────
//   1. GET  /notifications/unread-count   → getUnreadCount()
//   2. GET  /notifications                → findAll()
//   3. PUT  /notifications/read-all       → markAllRead()
//   4. PUT  /notifications/settings       → updateSettings()
//
//   DYNAMIC routes (bottom — after all statics)
//   ──────────────────────────────────────────────────
//   5. PUT  /notifications/:id/read       → markAsRead()   (sub-path before plain /:id)
//   6. DELETE /notifications/:id          → remove()
//
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── 1. GET /notifications/unread-count ─────────────────────────────────────
  // STATIC ROUTE — MUST be declared first to prevent NestJS routing collision.

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description:
      'Returns the total number of unread, live notifications for the calling ' +
      'user. This is a lightweight countDocuments query that hits the compound ' +
      'index and never loads documents into memory. ' +
      'Suitable for polling from the notification bell badge.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count returned successfully.',
    schema: { example: { count: 5 } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  getUnreadCount(@CurrentUser() user: { id: any }) {
    return this.notificationsService.getUnreadCount(user.id.toString());
  }

  // ─── 2. GET /notifications ───────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get paginated notifications',
    description:
      'Returns a reverse-chronological, paginated list of the calling user\'s ' +
      'in-app notifications. Soft-deleted items are excluded. ' +
      'Supports `page` and `limit` query parameters.',
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Notification list returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  findAll(
    @CurrentUser() user: { id: any },
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.findAll(user.id.toString(), query);
  }

  // ─── 3. PUT /notifications/read-all ─────────────────────────────────────────
  // STATIC ROUTE — declared before /:id/read to avoid routing collision.

  @Put('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description:
      'Atomically marks every unread, live notification owned by the calling ' +
      'user as read using a single `updateMany` database operation. ' +
      'Returns the count of documents modified.',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read.',
    schema: { example: { modifiedCount: 12 } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  markAllRead(@CurrentUser() user: { id: any }) {
    return this.notificationsService.markAllRead(user.id.toString());
  }

  // ─── 4. PUT /notifications/settings ─────────────────────────────────────────
  // STATIC ROUTE — declared before /:id to avoid routing collision.

  @Put('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update notification channel settings',
    description:
      'Creates or updates the calling user\'s notification channel preferences. ' +
      'Both `emailEnabled` and `inAppEnabled` are optional — send only the ' +
      'fields you want to change. Uses upsert internally so no seed step is ' +
      'required.',
  })
  @ApiResponse({ status: 200, description: 'Settings updated successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid payload).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  updateSettings(
    @CurrentUser() user: { id: any },
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationsService.updateSettings(user.id.toString(), dto);
  }

  // ─── 5. PUT /notifications/:id/read ─────────────────────────────────────────
  // DYNAMIC sub-path route — declared after all statics but before plain /:id.

  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a single notification as read',
    description:
      'Sets `isRead: true` on the specified notification document. ' +
      'This operation is idempotent — calling it on an already-read notification ' +
      'is a safe no-op. ' +
      'Throws ERR_4001 if the notification does not exist. ' +
      'Throws ERR_2001 if the caller does not own the notification.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the notification to mark as read',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller does not own this notification.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Notification not found.' })
  markAsRead(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any },
  ) {
    return this.notificationsService.markAsRead(user.id.toString(), id);
  }

  // ─── 6. DELETE /notifications/:id ───────────────────────────────────────────
  // DYNAMIC wildcard — declared last.

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete (soft-delete) a notification',
    description:
      'Sets `deletedAt` to the current timestamp, effectively hiding the ' +
      'notification from all user-facing queries without removing the document ' +
      'from the database. ' +
      'Throws ERR_4001 if the notification does not exist. ' +
      'Throws ERR_2001 if the caller does not own the notification.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the notification to delete',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 204, description: 'Notification deleted successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller does not own this notification.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Notification not found.' })
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any },
  ) {
    return this.notificationsService.remove(user.id.toString(), id);
  }
}
