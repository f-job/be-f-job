import {
  Controller,
  Get,
  UseGuards,
  UseInterceptors,
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

@ApiTags('Payments')
@Controller('payments')
@UseInterceptors(ResponseInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EMPLOYER)
@ApiBearerAuth('access-token')
export class PaymentsController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get('balance')
  @ApiOperation({
    summary: '[Employer] Detailed credit balance',
    description: 'Returns total available points, expiring points, and expiry date via Lazy Cleanup.',
  })
  @ApiResponse({ status: 200, description: 'Detailed balance returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Employer role required.' })
  getDetailedBalance(@CurrentUser() user: any) {
    return this.packagesService.getDetailedBalance(user.id.toString());
  }
}
