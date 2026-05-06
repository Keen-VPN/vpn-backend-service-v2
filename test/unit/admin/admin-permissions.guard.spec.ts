import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermissionsGuard } from '../../../src/admin/guards/admin-permissions.guard';
import { AdminAuditService } from '../../../src/admin/admin-audit.service';

describe('AdminPermissionsGuard', () => {
  it('logs denied permission attempts', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(['membership_transfer.approve']),
    } as unknown as Reflector;
    const audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminAuditService;
    const guard = new AdminPermissionsGuard(reflector, audit);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          path: '/api/admin/subscription/transfer-requests/1/approve',
          ip: '127.0.0.1',
          headers: { 'user-agent': 'jest' },
          adminAuth: {
            admin: {
              id: 'a-1',
              permissions: ['membership_transfer.read'],
            },
          },
        }),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect((audit as any).log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.permission.denied',
        adminUserId: 'a-1',
      }),
    );
  });
});
