import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export enum NotificationType {
  APPLICATION_STATUS    = 'APPLICATION_STATUS',
  NEW_JOB               = 'NEW_JOB',
  SYSTEM                = 'SYSTEM',
  SHIFT_REMINDER        = 'SHIFT_REMINDER',
  RECRUITMENT_MESSAGE   = 'RECRUITMENT_MESSAGE',
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Document
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationDocument = HydratedDocument<Notification>;

/**
 * Represents a single in-app notification event persisted in the
 * `notifications` MongoDB collection.
 *
 * Soft-delete strategy: `deletedAt` is set to the current timestamp when the
 * user "removes" a notification instead of issuing a hard DELETE. All list
 * queries filter `{ deletedAt: null }` to exclude deleted items without
 * losing audit history.
 *
 * Indexes (compound):
 *   - { userId, createdAt }  → optimises the paginated list query.
 *   - { userId, isRead, deletedAt } → optimises unread-count + read-all ops.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false }, // only createdAt needed
  collection: 'notifications',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Notification {
  /** Owner of this notification — must reference an existing User document. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** Short headline rendered in the notification bell / push card. */
  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  /** Full descriptive body of the notification. */
  @Prop({ required: true, trim: true, maxlength: 500 })
  body: string;

  /** Categorises the notification so the client can render the correct icon/action. */
  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  /** Tracks whether the user has opened/read this notification. */
  @Prop({ default: false })
  isRead: boolean;

  /**
   * Arbitrary context payload — e.g. { jobId, applicationId } — that the
   * front-end can use to deep-link into the relevant resource.
   */
  @Prop({ type: Object, default: null })
  metadata?: Record<string, any>;

  /**
   * Soft-delete sentinel. `null` means the document is live.
   * Set to the current Date when the user "deletes" the notification.
   */
  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// ── Compound indexes ──────────────────────────────────────────────────────────
// Index 1: Powers the paginated list query (filter by userId, sort by createdAt)
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Index 2: Powers the unread-count lookup and the bulk read-all update
NotificationSchema.index({ userId: 1, isRead: 1, deletedAt: 1 });


// ─────────────────────────────────────────────────────────────────────────────
// NotificationSettings Document
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationSettingsDocument = HydratedDocument<NotificationSettings>;

/**
 * Stores per-user channel preferences for the notification system.
 * Persisted in the `notification_settings` collection.
 *
 * A single document exists per user (enforced by the unique index on userId).
 * The service uses `findOneAndUpdate` with `{ upsert: true }` so the record
 * is created on first preference update without requiring a manual seed step.
 */
@Schema({
  timestamps: true,
  collection: 'notification_settings',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class NotificationSettings {
  /** 1-to-1 link to the owning User. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  /** When true, eligible notification events also trigger an email dispatch. */
  @Prop({ default: true })
  emailEnabled: boolean;

  /** When true, notification events are persisted as in-app notification docs. */
  @Prop({ default: true })
  inAppEnabled: boolean;
}

export const NotificationSettingsSchema =
  SchemaFactory.createForClass(NotificationSettings);
