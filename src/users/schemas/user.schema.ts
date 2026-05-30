import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  CANDIDATE = 'CANDIDATE',
  EMPLOYER = 'EMPLOYER',
}

export enum UserStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}
export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  FACEBOOK = 'FACEBOOK',
}

@Schema({
  timestamps: true,         // createdAt, updatedAt auto-managed
  collection: 'users',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.password;
      delete ret.refreshTokenHash;
      delete ret.passwordResetTokenHash;
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  @Prop({ trim: true, maxlength: 99 })
  fullName?: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, maxlength: 99 })
  email: string;

  @Prop({ select: false })
  password?: string;

  @Prop({ default: UserRole.USER, enum: UserRole })
  role: UserRole;

  @Prop({ default: UserStatus.ACTIVE, enum: UserStatus })
  status: UserStatus;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ default: AuthProvider.LOCAL, enum: AuthProvider })
  provider: AuthProvider;

  @Prop({ trim: true })
  providerId?: string;

  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop({ select: false })
  passwordResetTokenHash?: string;

  @Prop({ type: Date })
  passwordResetExpires?: Date;

  // ─── Referral System Fields ───────────────────────────────────────────────

  /**
   * Unique short code this user can share to invite others.
   * Generated lazily on first GET /referrals/my call if not already set.
   * Stored uppercase, e.g. "FJOB-A1B2C3D4".
   */
  @Prop({ type: String, unique: true, sparse: true, trim: true, uppercase: true })
  referralCode?: string;

  /**
   * Back-reference to the User whose referralCode this user applied.
   * Populated when a candidate calls POST /referrals/apply.
   * Null for users who were not referred by anyone.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  referredBy?: Types.ObjectId | null;

  /**
   * Accumulated referral reward wallet balance (in VND).
   * Incremented atomically whenever one of this user's referees
   * is confirmed as a successful referral.
   */
  @Prop({ type: Number, default: 0, min: 0 })
  referralBalance: number;
}

export const UserSchema = SchemaFactory.createForClass(User);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Index for password reset lookup
UserSchema.index({ passwordResetTokenHash: 1, passwordResetExpires: 1 });

// NOTE: { referralCode: 1 } index is declared implicitly by the
// @Prop({ unique: true, sparse: true }) decorator above — no manual
// UserSchema.index() call needed here.
