import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { CandidatesService } from './candidates.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, UserStatus } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ListCandidatesQueryDto } from './dto/list-candidates-query.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { UpdateCandidateStatusDto } from './dto/update-candidate-status.dto';

@ApiTags('Candidate Management')
@ApiBearerAuth('access-token')
@Controller('users/candidates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CandidatesController {
  constructor(
    private readonly candidatesService: CandidatesService,
    private readonly usersService: UsersService,
  ) {}

  // ─── GET /users/candidates ─────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Paginated list of all registered candidates' })
  @ApiQuery({ name: 'keyword', required: false, description: 'Filter by name or email (partial, case-insensitive)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated candidate list returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  findAll(@Query() query: ListCandidatesQueryDto) {
    return this.candidatesService.findAllCandidates(query);
  }

  // ─── GET /users/candidates/:id ─────────────────────────────────────────────

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Get full profile detail of a single candidate' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the candidate user', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'Candidate detail (User + CandidateProfile) returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate not found.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.candidatesService.findCandidateById(id);
  }

  // ─── PUT /users/candidates/:id ─────────────────────────────────────────────

  @Put(':id')
  @Roles(UserRole.CANDIDATE, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update candidate personal profile (self or Admin)',
    description:
      'A CANDIDATE may only update their own profile. An ADMIN may update any candidate. ' +
      'Unauthorized cross-user modification throws ERR_2001.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the candidate user', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'Candidate profile updated successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation failure (invalid ObjectId or payload).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Forbidden — caller is modifying another candidate\'s profile.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate not found.' })
  updateProfile(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.candidatesService.updateCandidateProfile(
      id,
      dto,
      user.id.toString(),
      user.role,
    );
  }

  // ─── PUT /users/candidates/:id/status ─────────────────────────────────────

  @Put(':id/status')
  @Roles(UserRole.CANDIDATE, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Toggle open-to-work status on a candidate profile (self or Admin)',
    description:
      'Allows a CANDIDATE to signal availability for jobs. ' +
      'Non-owners attempting to toggle another candidate\'s status receive ERR_2001.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the candidate user', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'open_to_work status updated successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation failure.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Forbidden — caller is modifying another candidate\'s status.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate not found.' })
  updateStatus(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCandidateStatusDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.candidatesService.updateCandidateStatus(
      id,
      dto.openToWork,
      user.id.toString(),
      user.role,
    );
  }

  // ─── PUT /users/candidates/:id/block ──────────────────────────────────────

  @Put(':id/block')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Block (suspend) a candidate account' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the candidate user', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'Candidate account has been blocked.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid ObjectId.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate not found.' })
  blockCandidate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.usersService.setUserStatus(id, UserStatus.BLOCKED);
  }

  // ─── PUT /users/candidates/:id/unblock ────────────────────────────────────

  @Put(':id/unblock')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Unblock (reinstate) a candidate account' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the candidate user', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 200, description: 'Candidate account has been reinstated.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid ObjectId.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate not found.' })
  unblockCandidate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.usersService.setUserStatus(id, UserStatus.ACTIVE);
  }

  // ─── DELETE /users/candidates/:id ─────────────────────────────────────────

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '[Admin] Permanently delete a candidate account and their profile',
    description:
      'Atomically removes the User document and the linked CandidateProfile in a single ' +
      'database transaction to prevent orphan records (Architecture Rule §4).',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the candidate user', example: '665f1a2b3c4d5e6f7a8b9c0d' })
  @ApiResponse({ status: 204, description: 'Candidate account and profile deleted successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid ObjectId.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have ADMIN role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate not found.' })
  @ApiResponse({ status: 500, description: 'ERR_5001 — Deletion transaction failed and was rolled back.' })
  deleteCandidate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.candidatesService.deleteCandidateAccount(id);
  }
}
