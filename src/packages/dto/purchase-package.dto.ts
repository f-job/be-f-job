import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class PurchasePackageDto {
  @ApiProperty({
    description: 'The MongoDB ObjectId of the package to purchase',
    example: '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @IsMongoId()
  @IsNotEmpty()
  packageId: string;
}
