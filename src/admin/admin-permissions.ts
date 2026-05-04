import { AdminUserRole } from '@prisma/client';

export const ADMIN_PERMISSIONS = [
  'membership_transfer.read',
  'membership_transfer.approve',
  'membership_transfer.reject',
  'users.read',
  'subscriptions.read',
  'subscriptions.write',
  'admin_users.manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const ALL: AdminPermission[] = [...ADMIN_PERMISSIONS];

const READ_TRANSFER: AdminPermission[] = [
  'membership_transfer.read',
  'users.read',
  'subscriptions.read',
];

const ROLE_PERMISSIONS: Record<AdminUserRole, AdminPermission[]> = {
  [AdminUserRole.SUPER_ADMIN]: ALL,
  [AdminUserRole.SUPPORT_ADMIN]: [
    ...READ_TRANSFER,
    'membership_transfer.reject',
  ],
  [AdminUserRole.BILLING_ADMIN]: [
    ...READ_TRANSFER,
    'membership_transfer.approve',
    'membership_transfer.reject',
    'subscriptions.write',
  ],
  [AdminUserRole.READONLY_ADMIN]: READ_TRANSFER,
};

export function permissionsForRole(role: AdminUserRole): AdminPermission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function adminHasPermission(
  role: AdminUserRole,
  permission: AdminPermission,
): boolean {
  return permissionsForRole(role).includes(permission);
}

export function adminHasAllPermissions(
  role: AdminUserRole,
  required: AdminPermission[],
): boolean {
  const set = new Set(permissionsForRole(role));
  return required.every((p) => set.has(p));
}
