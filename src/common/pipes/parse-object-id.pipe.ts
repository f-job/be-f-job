import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Validates that a route parameter is a valid MongoDB ObjectId string.
 * Throws ERR_3001 (Validation Exception) if the value is not a 24-character hex string.
 *
 * Usage: @Param('id', ParseObjectIdPipe) id: string
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException({
        errorCode: 'ERR_3001',
        message: `"${value}" is not a valid MongoDB ObjectId.`,
      });
    }
    return value;
  }
}
