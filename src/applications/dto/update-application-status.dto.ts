// dto/update-application-status.dto.ts

import { IsEnum } from 'class-validator';
import { ApplicationStatus } from '../../applications/schemas/application.schema';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;
}