import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { PackagesService } from '../packages/packages.service';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
@UseInterceptors(ResponseInterceptor)
export class PaymentsController {
  constructor(
    private readonly packagesService: PackagesService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Employer] Detailed credit balance',
    description: 'Returns total available points, expiring points, and expiry date via Lazy Cleanup.',
  })
  getDetailedBalance(@CurrentUser() user: any) {
    return this.packagesService.getDetailedBalance(user.id.toString());
  }

  @Get('credit-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Employer] Current credit cost configuration',
  })
  getCreditConfig() {
    return this.packagesService.getCreditConfig();
  }

  @Post('create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Employer] Create a top-up payment',
    description: 'Creates a pending payment for a package and returns VietQR details.',
  })
  createPayment(@Body('packageId') packageId: string, @CurrentUser() user: any) {
    return this.paymentsService.createPayment(user.id.toString(), packageId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Employer] Get payment status',
    description: 'Poll this endpoint to get current payment status.',
  })
  getPaymentStatus(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.getPayment(id, user.id.toString());
  }

  @Post('webhook')
  @ApiOperation({
    summary: '[System] Payment webhook callback',
    description: 'Receives transaction updates from payment gateway.',
  })
  async handleWebhook(
    @Headers('x-webhook-secret') secret: string,
    @Body() payload: { transactionId: string; amount: number; transferContent: string }
  ) {
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    return this.paymentsService.processWebhook(payload);
  }
}
