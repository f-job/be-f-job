import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PackagesService } from '../packages.service';
import { ListTransactionsDto } from '../dto/list-transactions.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';

@ApiTags('Employer Credits')
@Controller('employers')
@UseInterceptors(ResponseInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EMPLOYER)
@ApiBearerAuth('access-token')
export class EmployerCreditController {
  constructor(private readonly packagesService: PackagesService) {}

  // ─── 1. GET /employers/credit-balance ─────────────────────────────────────
  @Get('credit-balance')
  @ApiOperation({
    summary: '[Employer] Retrieve numerical credit currency balance',
    description: 'Returns the credit balance for the authenticated employer.',
  })
  @ApiResponse({ status: 200, description: 'Credit balance returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Employer role required.' })
  getBalance(@CurrentUser() user: any) {
    return this.packagesService.getCreditBalance(user.id.toString());
  }

  // ─── 2. POST /employers/credit/transactions ───────────────────────────────
  @Post('credit/transactions')
  @ApiOperation({
    summary: '[Employer] Retrieve paginated history ledger log of credit events',
    description: 'Returns paginated transactions ledger (credits earned, spent, adjusted).',
  })
  @ApiResponse({ status: 200, description: 'Credit transaction history returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Employer role required.' })
  getTransactions(@Body() dto: ListTransactionsDto, @CurrentUser() user: any) {
    return this.packagesService.findMyTransactions(user.id.toString(), dto);
  }
}
