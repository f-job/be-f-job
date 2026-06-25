import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PackagesModule } from '../packages/packages.module';

@Module({
  imports: [PackagesModule],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
