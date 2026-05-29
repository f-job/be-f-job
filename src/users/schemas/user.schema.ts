import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';

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
export class User extends Document {
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
}

export const UserSchema = SchemaFactory.createForClass(User);

// Index cho password reset lookup
UserSchema.index({ passwordResetTokenHash: 1, passwordResetExpires: 1 });
