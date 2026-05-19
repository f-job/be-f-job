import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
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
  @Prop({ required: true, trim: true, maxlength: 99 })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, maxlength: 99 })
  email: string;

  @Prop({ select: false })
  password?: string;

  @Prop({ default: UserRole.USER, enum: UserRole })
  role: UserRole;

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
