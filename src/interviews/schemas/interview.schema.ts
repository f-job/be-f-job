import {
    Prop,
    Schema,
    SchemaFactory,
} from '@nestjs/mongoose';

import {
    HydratedDocument,
    Types,
} from 'mongoose';

export type InterviewDocument =
    HydratedDocument<Interview>;

export enum InterviewStatus {
    SCHEDULED = 'scheduled',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    NO_SHOW = 'no_show',
}

@Schema({
    timestamps: true,
    collection: 'interviews',
})
export class Interview {
    @Prop({
        type: Types.ObjectId,
        ref: 'Application',
        required: true,
        index: true,
    })
    applicationId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: 'CandidateProfile',
        required: true,
        index: true,
    })
    candidateId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: 'EmployerProfile',
        required: true,
        index: true,
    })
    employerId: Types.ObjectId;

    @Prop({
        required: true,
    })
    scheduledAt: Date;

    @Prop()
    location?: string;

    @Prop()
    meetingLink?: string;

    @Prop()
    note?: string;

    @Prop({
        enum: InterviewStatus,
        default: InterviewStatus.SCHEDULED,
    })
    status: InterviewStatus;
}

export const InterviewSchema =
    SchemaFactory.createForClass(
        Interview,
    );

InterviewSchema.index({
    employerId: 1,
    scheduledAt: 1,
});

InterviewSchema.index({
    candidateId: 1,
});

InterviewSchema.index({
    applicationId: 1,
});