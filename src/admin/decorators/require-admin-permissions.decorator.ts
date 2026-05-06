import { SetMetadata } from '@nestjs/common';
import type { AdminPermission } from '../admin-permissions';

export const REQUIRE_ADMIN_PERMISSIONS_KEY = 'require_admin_permissions';

export const RequireAdminPermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(REQUIRE_ADMIN_PERMISSIONS_KEY, permissions);
