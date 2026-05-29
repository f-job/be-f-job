import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateExperienceDto, UpdateExperienceDto } from './dto/experience.dto';
import { CreateEducationDto, UpdateEducationDto } from './dto/education.dto';
import { AddSkillDto } from './dto/skill.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@ApiTags('CV / Candidate Profile')
@ApiBearerAuth('access-token')
@Controller('profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  // ─── 1. GET /profiles/my ──────────────────────────────────────────────────
  @Get('my')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Fetch own candidate profile" })
  @ApiResponse({ status: 200, description: 'Profile returned successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Profile not found.' })
  getMy(@CurrentUser() user: { id: string }) {
    return this.profilesService.getMyProfile(user.id);
  }

  // ─── 2. PUT /profiles/my ──────────────────────────────────────────────────
  @Put('my')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Update general profile summary information" })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3001 — Validation error.' })
  updateMy(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateProfile(user.id, dto);
  }

  // ─── 3. POST /profiles/experience ─────────────────────────────────────────
  @Post('experience')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Append a work experience subdocument" })
  @ApiResponse({ status: 201, description: 'Experience added successfully.' })
  addExperience(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateExperienceDto,
  ) {
    return this.profilesService.addExperience(user.id, dto);
  }

  // ─── 4. PUT /profiles/experience/:id ──────────────────────────────────────
  @Put('experience/:id')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Update a specific experience subdocument" })
  @ApiParam({ name: 'id', description: 'Internal Mongoose subdocument _id' })
  @ApiResponse({ status: 200, description: 'Experience updated successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Experience item not found.' })
  updateExperience(
    @CurrentUser() user: { id: string },
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateExperienceDto,
  ) {
    return this.profilesService.updateExperience(user.id, id, dto);
  }

  // ─── 5. DELETE /profiles/experience/:id ───────────────────────────────────
  @Delete('experience/:id')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Remove a specific experience subdocument" })
  @ApiParam({ name: 'id', description: 'Internal Mongoose subdocument _id' })
  @ApiResponse({ status: 200, description: 'Experience removed successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Experience item not found.' })
  deleteExperience(
    @CurrentUser() user: { id: string },
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.profilesService.deleteExperience(user.id, id);
  }

  // ─── 6. POST /profiles/education ──────────────────────────────────────────
  @Post('education')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Append an education item subdocument" })
  @ApiResponse({ status: 201, description: 'Education item added successfully.' })
  addEducation(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEducationDto,
  ) {
    return this.profilesService.addEducation(user.id, dto);
  }

  // ─── 7. PUT /profiles/education/:id ───────────────────────────────────────
  @Put('education/:id')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Update an education item subdocument" })
  @ApiParam({ name: 'id', description: 'Internal Mongoose subdocument _id' })
  @ApiResponse({ status: 200, description: 'Education item updated successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Education item not found.' })
  updateEducation(
    @CurrentUser() user: { id: string },
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateEducationDto,
  ) {
    return this.profilesService.updateEducation(user.id, id, dto);
  }

  // ─── 8. DELETE /profiles/education/:id ────────────────────────────────────
  @Delete('education/:id')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Remove an education item subdocument" })
  @ApiParam({ name: 'id', description: 'Internal Mongoose subdocument _id' })
  @ApiResponse({ status: 200, description: 'Education item removed successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Education item not found.' })
  deleteEducation(
    @CurrentUser() user: { id: string },
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.profilesService.deleteEducation(user.id, id);
  }

  // ─── 9. POST /profiles/skills ─────────────────────────────────────────────
  @Post('skills')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Add or update a skill with a proficiency rating" })
  @ApiResponse({ status: 201, description: 'Skill added or updated successfully.' })
  addSkill(
    @CurrentUser() user: { id: string },
    @Body() dto: AddSkillDto,
  ) {
    return this.profilesService.addOrUpdateSkill(user.id, dto);
  }

  // ─── 10. DELETE /profiles/skills/:skillId ─────────────────────────────────
  @Delete('skills/:skillId')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Remove a skill from the array" })
  @ApiParam({ name: 'skillId', description: 'Internal Mongoose skill subdocument _id' })
  @ApiResponse({ status: 200, description: 'Skill removed successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Skill not found.' })
  deleteSkill(
    @CurrentUser() user: { id: string },
    @Param('skillId', ParseObjectIdPipe) skillId: string,
  ) {
    return this.profilesService.deleteSkill(user.id, skillId);
  }

  // ─── 11. GET /profiles/files ──────────────────────────────────────────────
  @Get('files')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] List metadata of uploaded CV files" })
  @ApiResponse({ status: 200, description: 'Files list returned successfully.' })
  getFiles(@CurrentUser() user: { id: string }) {
    return this.profilesService.getFiles(user.id);
  }

  // ─── 12. POST /profiles/files ─────────────────────────────────────────────
  @Post('files')
  @Roles(UserRole.CANDIDATE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/cvs',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.pdf', '.doc', '.docx'];
        const ext = extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          return cb(
            new BadRequestException({
              errorCode: 'ERR_3005',
              message: 'Only PDF, DOC, and DOCX files are allowed.',
            }),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "[Candidate] Upload a CV file (PDF/Word, Max 5MB, Limit 3)" })
  @ApiResponse({ status: 201, description: 'CV uploaded successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3005 / ERR_4003 — Validation or limit error.' })
  uploadCv(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({
        errorCode: 'ERR_3002',
        message: 'No file uploaded.',
      });
    }
    return this.profilesService.uploadCvFile(user.id, file);
  }

  // ─── 13. DELETE /profiles/files/:id ───────────────────────────────────────
  @Delete('files/:id')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Delete an uploaded CV file" })
  @ApiParam({ name: 'id', description: 'Internal file subdocument _id' })
  @ApiResponse({ status: 200, description: 'File deleted successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — CV file not found.' })
  deleteCv(
    @CurrentUser() user: { id: string },
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.profilesService.deleteCvFile(user.id, id);
  }

  // ─── 14. PUT /profiles/files/:id/primary ──────────────────────────────────
  @Put('files/:id/primary')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Set a specific CV file as the primary one" })
  @ApiParam({ name: 'id', description: 'Internal file subdocument _id' })
  @ApiResponse({ status: 200, description: 'Set as primary CV successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — CV file not found.' })
  setPrimaryCv(
    @CurrentUser() user: { id: string },
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.profilesService.setPrimaryCvFile(user.id, id);
  }

  // ─── 15. GET /profiles/files/:id/download ─────────────────────────────────
  @Get('files/:id/download')
  @Roles(UserRole.CANDIDATE, UserRole.EMPLOYER, UserRole.ADMIN)
  @ApiOperation({ summary: "Download/Stream the CV file" })
  @ApiParam({ name: 'id', description: 'Internal file subdocument _id' })
  @ApiResponse({ status: 200, description: 'Streaming file.' })
  @ApiResponse({ status: 403, description: 'ERR_2001 — Forbidden.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — CV file not found.' })
  async downloadCv(
    @CurrentUser() user: { id: string; role: string },
    @Param('id', ParseObjectIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.profilesService.getCvFileForDownload(user.id, user.role, id);
    const fileStream = fs.createReadStream(file.filePath);

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    });

    return new StreamableFile(fileStream);
  }

  // ─── 16. PUT /profiles/avatar ─────────────────────────────────────────────
  @Put('avatar')
  @Roles(UserRole.CANDIDATE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          return cb(
            new BadRequestException({
              errorCode: 'ERR_3005',
              message: 'Only JPG, JPEG, PNG, and WEBP images are allowed.',
            }),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 2 * 1024 * 1024, // 2MB limit
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "[Candidate] Upload / Update profile avatar image (Max 2MB)" })
  @ApiResponse({ status: 200, description: 'Avatar updated successfully.' })
  @ApiResponse({ status: 400, description: 'ERR_3005 — Validation error.' })
  uploadAvatar(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({
        errorCode: 'ERR_3002',
        message: 'No file uploaded.',
      });
    }
    return this.profilesService.updateAvatar(user.id, file);
  }

  // ─── Avatar Image Public View Route ───────────────────────────────────────
  @Get('avatar/:filename')
  @ApiOperation({ summary: "Public route to render/view avatar image" })
  async getAvatarImage(@Param('filename') filename: string, @Res() res: Response) {
    if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
      throw new BadRequestException({ errorCode: 'ERR_3005', message: 'Invalid file name.' });
    }

    const filePath = join(process.cwd(), 'uploads/avatars', filename);
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException({ errorCode: 'ERR_4001', message: 'Avatar image not found.' });
    }

    res.sendFile(filePath);
  }

  // ─── 17. PUT /profiles/status ─────────────────────────────────────────────
  @Put('status')
  @Roles(UserRole.CANDIDATE)
  @ApiOperation({ summary: "[Candidate] Toggle job-seeking status (actively looking vs open)" })
  @ApiResponse({ status: 200, description: 'Status updated successfully.' })
  updateSeekingStatus(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateStatusDto,
  ) {
    return this.profilesService.updateStatus(user.id, dto.openToWork);
  }

  // ─── 18. GET /profiles/preview/:candidateId ───────────────────────────────
  @Get('preview/:candidateId')
  @Roles(UserRole.EMPLOYER, UserRole.ADMIN)
  @ApiOperation({ summary: "[Employer / Admin] Public preview of a candidate's profile" })
  @ApiParam({ name: 'candidateId', description: 'MongoDB ObjectId of the candidate user' })
  @ApiResponse({ status: 200, description: 'Candidate profile preview returned successfully.' })
  @ApiResponse({ status: 404, description: 'ERR_4001 — Candidate profile not found.' })
  preview(
    @Param('candidateId', ParseObjectIdPipe) candidateId: string,
  ) {
    return this.profilesService.previewProfile(candidateId);
  }
}
