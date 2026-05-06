import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionService } from './admin-session.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminLoginRateLimiterService } from './admin-login-rate-limit.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminPermissionsGuard } from './guards/admin-permissions.guard';
import { AdminUsersService } from './admin-users.service';
import { AdminSessionCleanupService } from './admin-session-cleanup.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AdminAuthController, AdminUsersController],
  providers: [
    AdminAuthService,
    AdminSessionService,
    AdminAuditService,
    AdminLoginRateLimiterService,
    AdminAuthGuard,
    AdminPermissionsGuard,
    AdminUsersService,
    AdminSessionCleanupService,
  ],
  exports: [
    AdminAuthService,
    AdminAuthGuard,
    AdminPermissionsGuard,
    AdminAuditService,
    AdminLoginRateLimiterService,
  ],
})
export class AdminModule {}
