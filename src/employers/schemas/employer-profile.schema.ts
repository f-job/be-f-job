import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type EmployerProfileDocument = HydratedDocument<EmployerProfile>;

export enum EmployerStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Schema({
  timestamps: true,
  collection: 'employer_profiles',
})
export class EmployerProfile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  companyName: string;

  @Prop({ trim: true })
  companyDescription?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  industry?: string;

  @Prop({ trim: true })
  companySize?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ default: EmployerStatus.PENDING_APPROVAL, enum: EmployerStatus })
  status: EmployerStatus;
}

export const EmployerProfileSchema = SchemaFactory.createForClass(EmployerProfile);
