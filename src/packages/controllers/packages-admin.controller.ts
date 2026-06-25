import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PackagesService } from '../packages.service';
import { CreatePackageDto } from '../dto/create-package.dto';
import { UpdatePackageDto } from '../dto/update-package.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';

@ApiTags('Admin Packages')
@Controller('packages')
@UseInterceptors(ResponseInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('access-token')
export class PackagesAdminController {
  constructor(private readonly packagesService: PackagesService) {}

  // ─── 1. GET /packages/admin ────────────────────────────────────────────────
  // List all packages for admin review
  @Get('admin')
  @ApiOperation({
    summary: '[Admin] List all service packages (both active and inactive)',
    description: 'Returns a complete list of all packages in the system for administrative CRUD operations.',
  })
  @ApiResponse({ status: 200, description: 'All packages returned successfully.' })
  findAll() {
    return this.packagesService.findAllPackagesForAdmin();
  }

  // ─── 2. GET /packages/credits/admin ────────────────────────────────────────
  // Global monitoring view of credit ledger flows across tenants
  // STATIC ROUTE - declared above /admin/:id
  @Get('credits/admin')
  @ApiOperation({
    summary: '[Admin] Global monitoring view of credit ledger flows across tenants',
    description: 'Returns paginated global transaction ledger of all package purchases and credit expenditures.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Credit ledger flows returned successfully.' })
  getGlobalLedger(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.packagesService.getAllCreditsFlows(Number(page), Number(limit));
  }

  // ─── 3. GET /packages/credits/admin/config ────────────────────────────────
  @Get('credits/admin/config')
  @ApiOperation({
    summary: '[Admin] Get Credit Config',
    description: 'Retrieve the master data for credit points system.',
  })
  @ApiResponse({ status: 200, description: 'Config returned successfully.' })
  getConfig() {
    return this.packagesService.getCreditConfig();
  }

  // ─── 4. POST /packages/credits/admin/config ───────────────────────────────
  @Post('credits/admin/config')
  @ApiOperation({
    summary: '[Admin] Update Credit Config',
    description: 'Update the master data for credit points system.',
  })
  @ApiResponse({ status: 200, description: 'Config updated successfully.' })
  updateConfig(@Body() body: any) {
    return this.packagesService.updateCreditConfig(body);
  }

  // ─── 5. POST /packages/admin ───────────────────────────────────────────────
  // Admin create package
  @Post('admin')
  @ApiOperation({
    summary: '[Admin] Create a new service package',
    description: 'Adds a new package to the system catalog.',
  })
  @ApiResponse({ status: 201, description: 'Package created successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid payload).' })
  create(@Body() dto: CreatePackageDto) {
    return this.packagesService.createPackage(dto);
  }

  // ─── 4. PUT /packages/admin/:id ────────────────────────────────────────────
  // Admin modify package
  // DYNAMIC ROUTE - declared below the static /admin & /credits/admin routes
  @Put('admin/:id')
  @ApiOperation({
    summary: '[Admin] Modify an existing package',
    description: 'Updates properties of an existing package by its ID.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the package', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'Package updated successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid ObjectId or payload).' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Package not found.' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    return this.packagesService.updatePackage(id, dto);
  }

  // ─── 5. DELETE /packages/admin/:id ─────────────────────────────────────────
  // Admin soft-delete package
  // DYNAMIC ROUTE - declared below the static /admin & /credits/admin routes
  @Delete('admin/:id')
  @ApiOperation({
    summary: '[Admin] Soft-delete / deactivate a package',
    description: 'Sets isActive flag to false to prevent further purchases of the package.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the package', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'Package deactivated successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Package not found.' })
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.packagesService.deletePackage(id);
  }
}
