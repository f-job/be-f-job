import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Payload for POST /conversations/:id/messages (HTTP fallback)
 * and for the WebSocket `sendMessage` event body.
 *
 * Intentionally minimal — attachments, reactions, and threading are
 * out-of-scope for the current sprint.
 */
export class SendMessageDto {
  @ApiProperty({
    description:
      'Plain-text body of the message. ' +
      'Hard-capped at 2 000 characters to bound document size. ' +
      'Must not be blank.',
    example: 'Hi! I saw your job posting for the event host position. Is it still available?',
    maxLength: 2000,
  })
  @IsString({ message: 'text must be a string.' })
  @IsNotEmpty({ message: 'text must not be empty.' })
  @MaxLength(2000, { message: 'text must not exceed 2 000 characters.' })
  text: string;
}
