import {
    Prop,
    Schema,
    SchemaFactory,
} from '@nestjs/mongoose';

import {
    HydratedDocument,
    Types,
} from 'mongoose';

export type FavoriteCandidateDocument =
    HydratedDocument<FavoriteCandidate>;

@Schema({
    timestamps: true,
    collection: 'favorite_candidates',
})
export class FavoriteCandidate {
    @Prop({
        type: Types.ObjectId,
        ref: 'EmployerProfile',
        required: true,
        index: true,
    })
    employerId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: 'CandidateProfile',
        required: true,
        index: true,
    })
    candidateId: Types.ObjectId;
}

export const FavoriteCandidateSchema =
    SchemaFactory.createForClass(
        FavoriteCandidate,
    );

FavoriteCandidateSchema.index(
    {
        employerId: 1,
        candidateId: 1,
    },
    {
        unique: true,
    },
);