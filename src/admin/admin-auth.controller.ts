import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import {
  CurrentAdmin,
  CurrentAdminSessionId,
} from './decorators/current-admin.decorator';
import type { AdminRequestUser } from '../types/express';
import { ADMIN_SESSION_COOKIE } from './admin.constants';
import {
  adminSessionClearCookieOptions,
  adminSessionCookieOptions,
} from './admin-cookie.util';

@ApiTags('Admin — Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    @Inject(AdminAuthService) private readonly adminAuth: AdminAuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin email/password login (sets HttpOnly session cookie)',
  })
  async login(
    @Body() body: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || null;
    const ua =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    const { rawToken, admin } = await this.adminAuth.login(
      body.email,
      body.password,
      ip,
      ua,
    );
    const maxAge = this.adminAuth.sessionMaxAgeSec();
    res.cookie(
      ADMIN_SESSION_COOKIE,
      rawToken,
      adminSessionCookieOptions(this.config, maxAge),
    );
    return { success: true, data: { admin } };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  @ApiCookieAuth(ADMIN_SESSION_COOKIE)
  @ApiOperation({ summary: 'Revoke current admin session and clear cookie' })
  async logout(
    @CurrentAdmin() admin: AdminRequestUser,
    @CurrentAdminSessionId() sessionId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null;
    await this.adminAuth.logout(sessionId, admin.id, req.ip || null, userAgent);
    res.clearCookie(
      ADMIN_SESSION_COOKIE,
      adminSessionClearCookieOptions(this.config),
    );
    return { success: true };
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @ApiCookieAuth(ADMIN_SESSION_COOKIE)
  @ApiOperation({ summary: 'Current admin profile and permissions' })
  me(@CurrentAdmin() admin: AdminRequestUser) {
    return { success: true, data: { admin } };
  }
}
