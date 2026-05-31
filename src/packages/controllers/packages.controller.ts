import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PackagesService } from '../packages.service';
import { PurchasePackageDto } from '../dto/purchase-package.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';

@ApiTags('Packages')
@Controller('packages')
@UseInterceptors(ResponseInterceptor)
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  // ─── 1. GET /packages ──────────────────────────────────────────────────────
  // Public - list of active packages for employers to view
  @Get()
  @ApiOperation({
    summary: 'Public list of active packages for Employers to view',
    description: 'Returns all packages currently active for purchase.',
  })
  @ApiResponse({ status: 200, description: 'Active packages returned successfully.' })
  findActive() {
    return this.packagesService.findActivePackages();
  }

  // ─── 2. GET /packages/my ───────────────────────────────────────────────────
  // Protected - Caller's currently active purchased packages/subscriptions
  // STATIC ROUTE - MUST be declared above /:id
  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Employer] View currently active purchased service packages/subscriptions',
    description: 'Returns all purchased packages that are currently active and not expired.',
  })
  @ApiResponse({ status: 200, description: 'Active purchased packages returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Employer role required.' })
  findMyPurchased(@CurrentUser() user: any) {
    return this.packagesService.findMyPurchasedPackages(user.id.toString());
  }

  // ─── 3. GET /packages/history ──────────────────────────────────────────────
  // Protected - Historical invoice log tracking package purchases
  // STATIC ROUTE - MUST be declared above /:id
  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Employer] Historical invoice log tracking package purchases',
    description: 'Returns a list of all historical package purchase transaction entries.',
  })
  @ApiResponse({ status: 200, description: 'Invoice logs returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Employer role required.' })
  findMyHistory(@CurrentUser() user: any) {
    return this.packagesService.findMyInvoiceHistory(user.id.toString());
  }

  // ─── 4. POST /packages/purchase ────────────────────────────────────────────
  // Protected - Initiate a package buy action
  // STATIC ROUTE - MUST be declared above /:id
  @Post('purchase')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYER)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[Employer] Purchase a credit package',
    description:
      'Initiates a package buy action. Increments credit balance, adds active package subscription, and records transaction ledger.',
  })
  @ApiResponse({ status: 201, description: 'Package purchased successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid packageId ObjectId).' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Employer role required / account pending/blocked.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Package or employer profile not found.' })
  purchase(@Body() dto: PurchasePackageDto, @CurrentUser() user: any) {
    return this.packagesService.purchasePackage(user.id.toString(), dto.packageId);
  }

  // ─── 5. GET /packages/:id ──────────────────────────────────────────────────
  // Public - Single package lookup
  // DYNAMIC ROUTE - MUST be placed below all static paths
  @Get(':id')
  @ApiOperation({
    summary: 'Single package specifications lookup',
    description: 'Returns specifications of a single package by its ID.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the package', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'Package specifications returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Package not found.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.packagesService.findSinglePackage(id);
  }
}
