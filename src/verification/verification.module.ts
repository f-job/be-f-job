import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '@/users/schemas/user.schema';
import { VerificationController } from './verification.controller';
import { PublicVerificationController } from './public-verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [
    VerificationController,
    PublicVerificationController, // Public endpoint for post-registration verification
  ],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
