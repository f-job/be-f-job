import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CreditConfigDocument = HydratedDocument<CreditConfig>;

@Schema({
  timestamps: true,
  collection: 'credit_configs',
})
export class CreditConfig {
  @Prop({ required: true, default: 10, min: 0 })
  unlockCvPoints: number;

  @Prop({ required: true, default: 15, min: 0 })
  buyCvPoints: number;

  @Prop({ required: true, default: 30, min: 0 })
  pinJobPoints: number;

  @Prop({ required: true, default: 15, min: 0 })
  urgentJobPoints: number;

  @Prop({ required: true, default: 5, min: 0 })
  refreshJobPoints: number;

  @Prop({ required: true, default: 'default', unique: true })
  type: string; // "default" configuration instance
}

export const CreditConfigSchema = SchemaFactory.createForClass(CreditConfig);
