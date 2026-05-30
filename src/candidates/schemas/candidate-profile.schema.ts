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

  // ─── Trust aggregates (Trust & Safety) ──────────────────────────────────────
  // Persisted Trust Score (0–100), maintained by TrustScoreService.recalculate.
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  trustScore: number;

  // Mean of visible ratings (1 dp), 0 when there are no visible reviews.
  @Prop({ type: Number, default: 0, min: 0, max: 5 })
  averageRating: number;

  // Count of currently-visible reviews for this reviewee.
  @Prop({ type: Number, default: 0, min: 0 })
  reviewCount: number;

  // True while there are fewer than 3 visible reviews.
  @Prop({ default: true })
  provisional: boolean;

  // Accumulated no-show transitions (penalty basis for the trust score).
  @Prop({ type: Number, default: 0, min: 0 })
  noShowCount: number;

  @Prop({ trim: true })
  headline?: string;

  @Prop({ trim: true })
  experienceSummary?: string;
}

export const CandidateProfileSchema = SchemaFactory.createForClass(CandidateProfile);

// ─── Indexes ────────────────────────────────────────────────────────────────────

// Full-text search across name, bio, address for candidate discovery
CandidateProfileSchema.index({ fullName: 'text', bio: 'text' });

// Skills array index for fast $in queries from employer search
CandidateProfileSchema.index({ skills: 1, openToWork: 1 });
