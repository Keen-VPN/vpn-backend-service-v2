import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminUserStatus } from '@prisma/client';
import type { Request } from 'express';
import { AdminUsersService } from './admin-users.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminPermissionsGuard } from './guards/admin-permissions.guard';
import { RequireAdminPermissions } from './decorators/require-admin-permissions.decorator';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import type { AdminRequestUser } from '../types/express';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { DisableAdminUserDto } from './dto/disable-admin-user.dto';
import { UpdateAdminPasswordDto } from './dto/update-admin-password.dto';
import { ADMIN_SESSION_COOKIE } from './admin.constants';

@ApiTags('Admin — Users')
@Controller('admin/users')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@ApiCookieAuth(ADMIN_SESSION_COOKIE)
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService) private readonly adminUsers: AdminUsersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAdminPermissions('admin_users.manage')
  @ApiOperation({
    summary: 'Create an admin user (super admin only for SUPER_ADMIN role)',
  })
  async create(
    @CurrentAdmin() actor: AdminRequestUser,
    @Body() body: CreateAdminUserDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || null;
    const ua =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    return this.adminUsers.create(actor, body, ip, ua);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @RequireAdminPermissions('admin_users.manage')
  @ApiOperation({
    summary: 'Update your own admin password (super admin only)',
  })
  async updateOwnPassword(
    @CurrentAdmin() actor: AdminRequestUser,
    @Body() body: UpdateAdminPasswordDto,
    @Req() req: Request,
  ) {
    const ua =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    return this.adminUsers.updateOwnPassword(
      actor,
      body.currentPassword,
      body.newPassword,
      req.ip || null,
      ua,
    );
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequireAdminPermissions('admin_users.manage')
  @ApiOperation({ summary: 'Disable an admin user' })
  async disable(
    @CurrentAdmin() actor: AdminRequestUser,
    @Param('id') id: string,
    @Body() body: DisableAdminUserDto,
    @Req() req: Request,
  ) {
    if (body.status !== AdminUserStatus.DISABLED) {
      throw new BadRequestException('Only disabling an admin is supported');
    }
    const ua =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    return this.adminUsers.disable(actor, id, req.ip || null, ua);
  }

  @Get('overview')
  @RequireAdminPermissions('users.read')
  @ApiOperation({ summary: 'Admin users overview (count + longest sessions)' })
  async overview() {
    return this.adminUsers.getUsersOverview(20);
  }
}
