import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmployersService } from './employers.service';
import { EmployerProfile, EmployerProfileSchema } from './schemas/employer-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmployerProfile.name, schema: EmployerProfileSchema },
    ]),
  ],
  providers: [EmployersService],
  exports: [EmployersService],
})
export class EmployersModule {}
