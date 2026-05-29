import { Module }         from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PayoutsController }    from './payouts.controller';
import { PayoutsService }       from './payouts.service';
import { Payout, PayoutSchema } from './schemas/payout.schema';
import {
  PayoutSettings,
  PayoutSettingsSchema,
} from './schemas/payout-settings.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      // Payout request ledger
      { name: Payout.name, schema: PayoutSchema },

      // Per-user bank account settings
      { name: PayoutSettings.name, schema: PayoutSettingsSchema },

      // User model needed for: referral balance reads in eligibility check
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PayoutsController],
  providers:   [PayoutsService],
  exports:     [PayoutsService],
})
export class PayoutsModule {}
