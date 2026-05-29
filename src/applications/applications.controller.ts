import {
  Controller,
  Post,
  Get,
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
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

// ─────────────────────────────────────────────────────────────────────────────
// !! ROUTING ORDER SAFEGUARD !!
//
// NestJS resolves routes in declaration order.
// Static literal routes MUST be declared BEFORE dynamic /:id wildcards,
// otherwise NestJS will attempt to match "my" or "check" as an ObjectId param,
// breaking those routes entirely.
//
// Enforced order within this controller:
//
//   STATIC  (before any /:id)
//   ─────────────────────────────────────────────────
//   1. POST /applications           → apply()           (no param — safe anywhere)
//   2. GET  /applications/my        → findMy()          STATIC literal — FIRST
//
//   DYNAMIC (after all statics)
//   ─────────────────────────────────────────────────
//   3. GET  /applications/:jobId/check → checkApplied() sub-path; jobId validated
//   4. GET  /applications/:id/status   → getStatus()    sub-path on dynamic :id
//   5. GET  /applications/:id          → findOne()      wildcard — last GET
//   6. DEL  /applications/:id          → withdraw()     wildcard DELETE
//
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Applications (Candidate)')
@ApiBearerAuth('access-token')
@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // ─── 1. POST /applications ─────────────────────────────────────────────────
  // Apply to a casual job shift (Online CV / uploaded PDF / quick-apply)

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[Candidate] Apply to a casual job shift',
    description:
      'Submits a new application to an ACTIVE casual job. ' +
      'Three submission modes are supported: "online" (pre-built profile), ' +
      '"pdf" (uploaded PDF — requires cvPdfUrl), and "quick" (quick-apply). ' +
      'Throws ERR_4002 if the candidate has already applied to this job. ' +
      'Throws ERR_4001 if the job does not exist or is not ACTIVE. ' +
      'Atomically increments Job.applicationCount on success.',
  })
  @ApiResponse({ status: 201, description: 'Application submitted successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error (invalid payload or ObjectId).' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Job not found or not accepting applications.' })
  @ApiResponse({ status: 409, description: 'ERR_4002 — Candidate has already applied to this job.' })
  apply(
    @Body() dto: CreateApplicationDto,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.applicationsService.apply(user.id.toString(), dto);
  }

  // ─── 2. GET /applications/my ───────────────────────────────────────────────
  // STATIC ROUTE — declared before /:id to prevent NestJS routing collision

  @Get('my')
  @ApiOperation({
    summary: "[Candidate] Own application / shift registration history",
    description:
      "Returns a paginated, reverse-chronological list of all the calling " +
      "candidate's applications. Each entry includes a job snapshot " +
      "(title, company, location, status) to avoid a second round-trip.",
  })
  @ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Application history returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  findMy(
    @CurrentUser() user: { id: any; email: string; role: string },
    @Query('page')  page  = 1,
    @Query('limit') limit = 10,
  ) {
    return this.applicationsService.findMyApplications(
      user.id.toString(),
      Number(page),
      Number(limit),
    );
  }

  // ─── 3. GET /applications/:jobId/check ────────────────────────────────────
  // DYNAMIC ROUTE: /:jobId is a param, /check is a sub-path literal.
  // Placed BEFORE the plain /:id wildcard to avoid route shadowing.

  @Get(':jobId/check')
  @ApiOperation({
    summary: '[Candidate] Check if already applied to a specific casual job',
    description:
      'Returns { applied: boolean }. ' +
      'Consumed by the front-end to toggle the "Apply" button state ' +
      'before navigating to the full application form. ' +
      'No side effects — read-only.',
  })
  @ApiParam({
    name:        'jobId',
    description: 'MongoDB ObjectId of the casual job to check',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Check result returned.', schema: { example: { applied: true } } })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'Forbidden — caller does not have CANDIDATE role.' })
  checkApplied(
    @Param('jobId', ParseObjectIdPipe) jobId: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.applicationsService.checkApplied(jobId, user.id.toString());
  }

  // ─── 4. GET /applications/:id/status ──────────────────────────────────────
  // DYNAMIC sub-path route — placed BEFORE the plain /:id wildcard.

  @Get(':id/status')
  @ApiOperation({
    summary: '[Candidate] Quick tracking of application state',
    description:
      'Returns a lightweight status snapshot for the candidate tracking view: ' +
      '{ status, scheduledAt?, employerNote?, updatedAt }. ' +
      'Tracks the pipeline: Applied → Viewed → Scheduled → Accepted / Rejected. ' +
      'Throws ERR_4001 if not found; ERR_2001 if not the application owner.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the application',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Application status snapshot returned.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller does not own this application.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Application not found.' })
  getStatus(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.applicationsService.getStatus(id, user.id.toString());
  }

  // ─── 5. GET /applications/:id ─────────────────────────────────────────────
  // DYNAMIC wildcard — placed LAST among GET routes.

  @Get(':id')
  @ApiOperation({
    summary: '[Candidate] Detailed view of a specific job application',
    description:
      'Returns the full application document including populated job snapshot ' +
      '(title, company, salary, working hours, status). ' +
      'Throws ERR_4001 if not found; ERR_2001 if not the application owner.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the application',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 200, description: 'Application detail returned successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller does not own this application.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Application not found.' })
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.applicationsService.findById(id, user.id.toString());
  }

  // ─── 6. DELETE /applications/:id ──────────────────────────────────────────
  // Withdraw / cancel the application — allowed only while status = 'Applied'

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '[Candidate] Withdraw / cancel an application',
    description:
      'Marks the application as "Withdrawn". ' +
      'Withdrawal is ONLY permitted while the application status is "Applied" ' +
      '(i.e. the employer has not yet viewed it). ' +
      'Throws ERR_2002 if the application has already been reviewed. ' +
      'Throws ERR_2001 if the caller is not the application owner. ' +
      'Decrements Job.applicationCount on success.',
  })
  @ApiParam({
    name:        'id',
    description: 'MongoDB ObjectId of the application to withdraw',
    example:     '665f1a2b3c4d5e6f7a8b9c0d',
  })
  @ApiResponse({ status: 204, description: 'Application withdrawn successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Invalid MongoDB ObjectId format.' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid access token.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Caller does not own this application. | ERR_2002 — Application already reviewed; withdrawal denied.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Application not found.' })
  withdraw(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: { id: any; email: string; role: string },
  ) {
    return this.applicationsService.withdraw(id, user.id.toString());
  }
}
