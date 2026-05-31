import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreditTransactionType } from '../schemas/credit-transaction.schema';

export class ListTransactionsDto {
  @ApiPropertyOptional({ description: 'Page number for pagination', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter transaction ledger by type',
    enum: CreditTransactionType,
    example: CreditTransactionType.PURCHASE,
  })
  @IsOptional()
  @IsEnum(CreditTransactionType)
  type?: CreditTransactionType;
}
