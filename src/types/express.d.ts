import type { AdminPermission } from '../admin/admin-permissions';
import type { AdminUserRole } from '@prisma/client';

export type AdminRequestUser = {
  id: string;
  email: string;
  name: string;
  role: AdminUserRole;
  permissions: AdminPermission[];
};

declare global {
  namespace Express {
    interface Request {
      /** Populated by AdminAuthGuard after session validation. */
      adminAuth?: {
        admin: AdminRequestUser;
        sessionId: string;
      };
    }
  }
}

export {};
