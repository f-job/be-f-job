import { Module }          from '@nestjs/common';
import { MongooseModule }  from '@nestjs/mongoose';
import { ReferralsController } from './referrals.controller';
import { ReferralsService }    from './referrals.service';
import { Referral, ReferralSchema } from './schemas/referral.schema';
import { User, UserSchema }         from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      // Primary referral log collection
      { name: Referral.name, schema: ReferralSchema },

      // User model needed for: referral code lookup, balance increment, referredBy write
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReferralsController],
  providers:   [ReferralsService],
  exports:     [ReferralsService],
})
export class ReferralsModule {}
