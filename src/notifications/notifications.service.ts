import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationSettings,
  NotificationSettingsDocument,
} from './schemas/notification.schema';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,

    @InjectModel(NotificationSettings.name)
    private readonly settingsModel: Model<NotificationSettingsDocument>,
  ) {}

  // ─── GET /notifications ─────────────────────────────────────────────────────

  /**
   * Returns a paginated, reverse-chronological list of the calling user's
   * in-app notifications.
   *
   * Soft-deleted documents (deletedAt ≠ null) are excluded so they never
   * surface in the user-facing UI.
   */
  async findAll(userId: string, dto: QueryNotificationsDto) {
    const userObjectId = new Types.ObjectId(userId);
    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 10;
    const skip  = (page - 1) * limit;

    const baseFilter = {
      userId:    userObjectId,
      deletedAt: null,
    };

    const [data, total] = await Promise.all([
      this.notificationModel
        .find(baseFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(baseFilter),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── GET /notifications/unread-count ────────────────────────────────────────

  /**
   * Returns the global count of unread, live notifications for the caller.
   * This lightweight query hits the compound index
   *   { userId, isRead, deletedAt }
   * and never loads documents into memory.
   */
  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationModel.countDocuments({
      userId:    new Types.ObjectId(userId),
      isRead:    false,
      deletedAt: null,
    });

    return { count };
  }

  // ─── PUT /notifications/:id/read ─────────────────────────────────────────────

  /**
   * Marks a single notification as read.
   *
   * Guards:
   *   ERR_4001 — Notification not found (or already soft-deleted).
   *   ERR_2001 — Caller does not own the notification.
   */
  async markAsRead(
    userId:         string,
    notificationId: string,
  ): Promise<NotificationDocument> {
    const notification = await this.notificationModel
      .findOne({
        _id:       new Types.ObjectId(notificationId),
        deletedAt: null,
      })
      .select('userId isRead');

    if (!notification) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Notification with ID "${notificationId}" was not found.`,
      });
    }

    if (notification.userId.toString() !== userId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have permission to modify this notification.',
      });
    }

    // Idempotent — marking an already-read notification is a no-op.
    if (!notification.isRead) {
      await this.notificationModel.updateOne(
        { _id: new Types.ObjectId(notificationId) },
        { $set: { isRead: true } },
      );
    }

    // Return the refreshed document so callers get the latest state.
    return this.notificationModel
      .findById(notificationId)
      .lean() as unknown as NotificationDocument;
  }

  // ─── PUT /notifications/read-all ─────────────────────────────────────────────

  /**
   * Atomically marks all of the caller's unread, live notifications as read.
   *
   * Uses a single `updateMany` call rather than loading documents into memory,
   * which keeps the operation O(1) in memory regardless of volume.
   *
   * Returns a summary of how many documents were modified.
   */
  async markAllRead(userId: string): Promise<{ modifiedCount: number }> {
    const result = await this.notificationModel.updateMany(
      {
        userId:    new Types.ObjectId(userId),
        isRead:    false,
        deletedAt: null,
      },
      { $set: { isRead: true } },
    );

    return { modifiedCount: result.modifiedCount };
  }

  // ─── DELETE /notifications/:id ────────────────────────────────────────────────

  /**
   * Soft-deletes a notification by setting `deletedAt` to the current timestamp.
   * The document is retained in MongoDB for potential audit purposes but will
   * no longer appear in any user-facing list or count queries.
   *
   * Guards:
   *   ERR_4001 — Notification not found.
   *   ERR_2001 — Caller does not own the notification.
   */
  async remove(userId: string, notificationId: string): Promise<void> {
    const notification = await this.notificationModel
      .findOne({
        _id:       new Types.ObjectId(notificationId),
        deletedAt: null,
      })
      .select('userId');

    if (!notification) {
      throw new NotFoundException({
        errorCode: 'ERR_4001',
        message:   `Notification with ID "${notificationId}" was not found.`,
      });
    }

    if (notification.userId.toString() !== userId) {
      throw new ForbiddenException({
        errorCode: 'ERR_2001',
        message:   'You do not have permission to delete this notification.',
      });
    }

    await this.notificationModel.updateOne(
      { _id: new Types.ObjectId(notificationId) },
      { $set: { deletedAt: new Date() } },
    );
  }

  // ─── PUT /notifications/settings ─────────────────────────────────────────────

  /**
   * Creates or updates the caller's notification channel preferences.
   *
   * Uses `upsert: true` so no manual seed step is required — the document
   * is automatically created on the first preference update.
   */
  async updateSettings(
    userId: string,
    dto:    UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDocument> {
    const updated = await this.settingsModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $set: { ...dto } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean();

    return updated as NotificationSettingsDocument;
  }

  /**
   * Retrieves the caller's notification settings.
   * Returns the default preference values if no settings document exists yet.
   */
  async getSettings(userId: string): Promise<NotificationSettingsDocument> {
    const settings = await this.settingsModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();

    if (!settings) {
      // Return a virtual default without persisting it — persistence happens on
      // the first explicit PUT /notifications/settings call.
      return {
        userId:       new Types.ObjectId(userId),
        emailEnabled: true,
        inAppEnabled: true,
      } as unknown as NotificationSettingsDocument;
    }

    return settings as NotificationSettingsDocument;
  }
}
