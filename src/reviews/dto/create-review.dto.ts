import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Payload for POST /reviews — "Leave a review for a Completed application".
 *
 * A reviewer (the candidate or the job's employer) rates their counterparty
 * after the referenced application has reached the `Completed` status. The
 * review direction and the reviewee are resolved server-side from the
 * application and the authenticated reviewer; the client only supplies the
 * application, rating, and an optional comment.
 */
export class CreateReviewDto {
  @ApiProperty({
    description:
      'MongoDB ObjectId of the Completed application this review is tied to.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @IsMongoId()
  applicationId: string;

  @ApiProperty({
    description:
      'Star rating for the counterparty. Must be an integer from 1 to 5 inclusive.',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    description:
      'Optional free-text comment about the counterparty (max 1,000 characters).',
    maxLength: 1000,
    example: 'Reliable and punctual — showed up on time and worked the full shift.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
