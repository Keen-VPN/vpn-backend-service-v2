import type { Request } from 'express';
import { AdminSubscriptionTransferController } from '../../../src/subscription/admin-subscription-transfer.controller';

describe('AdminSubscriptionTransferController audit logging', () => {
  let controller: AdminSubscriptionTransferController;
  let transferService: {
    adminGetProofView: jest.Mock;
    adminGetProofPayload: jest.Mock;
    adminApprove: jest.Mock;
    adminReject: jest.Mock;
  };
  let audit: { log: jest.Mock };

  const admin = {
    id: 'admin-1',
    email: 'ops@example.com',
    name: 'Ops',
    role: 'SUPER_ADMIN',
    permissions: [],
  } as any;
  const req = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  } as Request;

  beforeEach(async () => {
    transferService = {
      adminGetProofView: jest.fn().mockResolvedValue({ success: true }),
      adminGetProofPayload: jest.fn().mockResolvedValue({
        buffer: Buffer.from('a'),
        contentType: 'image/png',
      }),
      adminApprove: jest.fn().mockResolvedValue({ success: true }),
      adminReject: jest.fn().mockResolvedValue({ success: true }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    controller = new AdminSubscriptionTransferController(
      transferService as never,
      audit as never,
    );
  });

  it('logs proof view access', async () => {
    await controller.proofView('req-1', admin, req);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'membership_transfer.proof_viewed',
        targetId: 'req-1',
        adminUserId: 'admin-1',
      }),
    );
  });

  it('logs approve mutation', async () => {
    await controller.approve(
      'req-1',
      { approvedCreditDays: 30, adminNote: 'ok' },
      admin,
      req,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'membership_transfer.approved',
        targetId: 'req-1',
      }),
    );
  });

  it('logs reject mutation', async () => {
    await controller.reject('req-1', { adminNote: 'no' }, admin, req);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'membership_transfer.rejected',
        targetId: 'req-1',
      }),
    );
  });
});
