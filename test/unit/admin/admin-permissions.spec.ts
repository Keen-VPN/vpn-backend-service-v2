import { AdminUserRole } from '@prisma/client';
import {
  adminHasAllPermissions,
  adminHasPermission,
} from '../../../src/admin/admin-permissions';

describe('admin permissions', () => {
  it('READONLY cannot approve or reject', () => {
    expect(
      adminHasPermission(
        AdminUserRole.READONLY_ADMIN,
        'membership_transfer.approve',
      ),
    ).toBe(false);
    expect(
      adminHasPermission(
        AdminUserRole.READONLY_ADMIN,
        'membership_transfer.reject',
      ),
    ).toBe(false);
    expect(
      adminHasPermission(
        AdminUserRole.READONLY_ADMIN,
        'membership_transfer.read',
      ),
    ).toBe(true);
  });

  it('SUPPORT can reject but not approve', () => {
    expect(
      adminHasPermission(
        AdminUserRole.SUPPORT_ADMIN,
        'membership_transfer.reject',
      ),
    ).toBe(true);
    expect(
      adminHasPermission(
        AdminUserRole.SUPPORT_ADMIN,
        'membership_transfer.approve',
      ),
    ).toBe(false);
  });

  it('BILLING can approve and reject', () => {
    expect(
      adminHasAllPermissions(AdminUserRole.BILLING_ADMIN, [
        'membership_transfer.approve',
        'membership_transfer.reject',
      ]),
    ).toBe(true);
  });

  it('SUPER_ADMIN can manage everything', () => {
    expect(
      adminHasPermission(AdminUserRole.SUPER_ADMIN, 'admin_users.manage'),
    ).toBe(true);
  });
});
