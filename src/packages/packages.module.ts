import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Package, PackageSchema } from './schemas/package.schema';
import { EmployerCredit, EmployerCreditSchema } from './schemas/employer-credit.schema';
import { CreditTransaction, CreditTransactionSchema } from './schemas/credit-transaction.schema';
import { EmployerProfile, EmployerProfileSchema } from '../employers/schemas/employer-profile.schema';
import { PackagesService } from './packages.service';
import { PackagesController } from './controllers/packages.controller';
import { EmployerCreditController } from './controllers/employer-credit.controller';
import { PackagesAdminController } from './controllers/packages-admin.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Package.name, schema: PackageSchema },
      { name: EmployerCredit.name, schema: EmployerCreditSchema },
      { name: CreditTransaction.name, schema: CreditTransactionSchema },
      { name: EmployerProfile.name, schema: EmployerProfileSchema },
    ]),
  ],
  controllers: [
    PackagesController,
    EmployerCreditController,
    PackagesAdminController,
  ],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
