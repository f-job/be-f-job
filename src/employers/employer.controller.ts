import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Put,
    Req,
    UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { EmployerService } from './employers.service';

import { UpdateEmployerDto } from './dto/update-employer.dto';
import { RejectEmployerDto } from './dto/reject-employer.dto';
import { BlockEmployerDto } from './dto/block-employer.dto';

@Controller('employers')
export class EmployerController {
    constructor(
        private readonly employerService: EmployerService,
    ) { }

    // GET /employers
    @Get()
    findAll() {
        return this.employerService.findAll();
    }

    // GET /employers/:id
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.employerService.findOne(id);
    }

    // PUT /employers/:id
    @UseGuards(AuthGuard('jwt'))
    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateEmployerDto,
    ) {
        return this.employerService.update(id, dto);
    }

    // PUT /employers/:id/verify
    @UseGuards(AuthGuard('jwt'))
    @Put(':id/verify')
    verify(
        @Param('id') id: string,
        @Req() req,
    ) {
        return this.employerService.verify(
            id,
            req.user.id,
        );
    }

    // PUT /employers/:id/reject
    @UseGuards(AuthGuard('jwt'))
    @Put(':id/reject')
    reject(
        @Param('id') id: string,
        @Body() dto: RejectEmployerDto,
    ) {
        return this.employerService.reject(id, dto);
    }

    // PUT /employers/:id/block
    @UseGuards(AuthGuard('jwt'))
    @Put(':id/block')
    block(
        @Param('id') id: string,
        @Body() dto: BlockEmployerDto,
    ) {
        return this.employerService.block(
            id,
            dto.blockedReason,
        );
    }

    // DELETE /employers/:id
    @UseGuards(AuthGuard('jwt'))
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.employerService.remove(id);
    }
}