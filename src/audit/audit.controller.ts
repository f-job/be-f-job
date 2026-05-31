import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockedUserGuard } from '../auth/guards/blocked-user.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

/**
 * AuditController — admin-only read surface over the append-only audit trail.
 *
 * Exposes a single `GET /admin/audit-logs` endpoint that returns a paginated,
 * newest-first slice of the trail, optionally filtered by `actorId`, `action`,
 * and/or `targetId` (Req 15.4; Design → Components → "Cross-cutting — Audit").
 *
 * The trail is append-only: there is intentionally NO create/update/delete API
 * here — records are written internally via `AuditService.append` by the
 * lifecycle/moderation flows and can only be read back through this surface.
 */
@ApiTags('Admin — Audit Logs')
@ApiBearerAuth('access-token')
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard, BlockedUserGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // ─── GET /admin/audit-logs ──────────────────────────────────────────────────
  @Get()
  @ApiOperation({
    summary:
      '[Admin] List audit-log records (filter by actorId / action / targetId; paginated, newest-first)',
  })
  @ApiResponse({ status: 200, description: 'Paginated audit-log list.' })
  query(@Query() query: AuditQueryDto) {
    return this.auditService.query(query);
  }
}
