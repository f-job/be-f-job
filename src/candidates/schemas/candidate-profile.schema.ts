import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';

export type CandidateProfileDocument = HydratedDocument<CandidateProfile>;

@Schema({
  timestamps: true,
  collection: 'candidate_profiles',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class CandidateProfile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  resumeUrl?: string;

  @Prop({ default: false, index: true })
  openToWork: boolean;

  @Prop({ trim: true })
  avatarUrl?: string;

  /**
   * Skills / competencies for casual labour matching.
   * Examples: ['Pha chế', 'Phục vụ', 'Lái xe máy', 'Kho vận', 'PG/PB']
   * Used by GET /search/candidates?skills=Pha chế,Phục vụ
   */
  @Prop({ type: [String], default: [], index: true })
  skills: string[];

  /**
   * Short self-introduction / summary for context-based candidate search.
   * Matched with $regex for keyword context search in GET /search/candidates.
   * Max 500 characters to stay lightweight.
   */
  @Prop({ trim: true, maxlength: 500 })
  bio?: string;
}

export const CandidateProfileSchema = SchemaFactory.createForClass(CandidateProfile);

// ─── Indexes ────────────────────────────────────────────────────────────────────

// Full-text search across name, bio, address for candidate discovery
CandidateProfileSchema.index({ fullName: 'text', bio: 'text' });

// Skills array index for fast $in queries from employer search
CandidateProfileSchema.index({ skills: 1, openToWork: 1 });
