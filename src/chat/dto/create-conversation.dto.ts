import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

/**
 * Payload for POST /conversations.
 *
 * The calling user is automatically included as the first participant from the
 * JWT session context.  The client only needs to supply the other participant's
 * MongoDB ObjectId — the service resolves their role to enforce the
 * CANDIDATE ↔ EMPLOYER pair constraint.
 */
export class CreateConversationDto {
  @ApiProperty({
    description:
      'MongoDB ObjectId of the other conversation participant. ' +
      'Must reference a valid User whose role is either CANDIDATE or EMPLOYER. ' +
      'The caller and recipient together must form a CANDIDATE ↔ EMPLOYER pair.',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @IsNotEmpty({ message: 'recipientId must not be empty.' })
  @IsMongoId({ message: 'recipientId must be a valid MongoDB ObjectId.' })
  recipientId: string;
}
