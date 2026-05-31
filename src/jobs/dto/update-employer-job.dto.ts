import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployerJobDto } from './create-employer-job.dto';

export class UpdateEmployerJobDto extends PartialType(
  CreateEmployerJobDto,
) {}