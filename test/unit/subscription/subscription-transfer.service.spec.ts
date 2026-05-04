import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { SubscriptionTransferService } from '../../../src/subscription/subscription-transfer.service';

/** Mirrors `TransferRequestStatus` in Prisma — use literals here so tests do not depend on `@prisma/client` enum re-exports (which can lag `prisma generate` or confuse TS). */
const TransferRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MembershipTransferS3Service } from '../../../src/subscription/membership-transfer-s3.service';
import { MEMBERSHIP_TRANSFER_RISK } from '../../../src/subscription/membership-transfer.constants';

describe('SubscriptionTransferService', () => {
  let service: SubscriptionTransferService;
  let mockTransferS3: {
    verifyUploadedProofObject: jest.Mock;
    enabled: jest.Mock;
    getBucket: jest.Mock;
    parseStorageUrl: jest.Mock;
    createPresignedGetForProofKey: jest.Mock;
    proofStorageUrl: jest.Mock;
  };
  let mockPrisma: Record<string, unknown> & {
    subscriptionTransferRequest: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    subscriptionCreditLedger: { create: jest.Mock; findUnique: jest.Mock };
    subscription: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    appleIAPPurchase: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
    trialGrant: { findFirst: jest.Mock };
    deviceTrialFingerprint: { findFirst: jest.Mock };
    pushToken: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  const userId = 'user-1';
  const futureExpiry = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const defaultUser = {
    id: userId,
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
  };

  function publicRow(over: Record<string, unknown> = {}) {
    return {
      id: 'req-1',
      userId,
      provider: 'OtherVPN',
      expiryDate: new Date(futureExpiry),
      proofUrl: 'https://example.com/p.png',
      proofBlob: null,
      status: TransferRequestStatus.PENDING,
      requestedCreditDays: 30,
      approvedCreditDays: null,
      adminNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
      reviewedByAdminId: null,
      ...over,
    };
  }

  beforeEach(async () => {
    const tx = {
      subscriptionTransferRequest: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      subscriptionCreditLedger: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      subscription: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      appleIAPPurchase: { findFirst: jest.fn() },
    };

    mockPrisma = {
      subscriptionTransferRequest: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      subscriptionCreditLedger: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      subscription: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      appleIAPPurchase: { findFirst: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(defaultUser) },
      trialGrant: { findFirst: jest.fn().mockResolvedValue(null) },
      deviceTrialFingerprint: { findFirst: jest.fn().mockResolvedValue(null) },
      pushToken: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        return fn(tx);
      }),
    };

    mockTransferS3 = {
      verifyUploadedProofObject: jest.fn(),
      enabled: jest.fn().mockReturnValue(true),
      getBucket: jest.fn().mockReturnValue('test-bucket'),
      parseStorageUrl: jest.fn(),
      createPresignedGetForProofKey: jest.fn(),
      proofStorageUrl: jest.fn((key: string) => `s3://test-bucket/${key}`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionTransferService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MembershipTransferS3Service, useValue: mockTransferS3 },
      ],
    }).compile();

    service = module.get(SubscriptionTransferService);

    mockPrisma.$transaction.mockImplementation(
      async (fn: (t: typeof tx) => Promise<unknown>) => {
        return fn(tx);
      },
    );
  });

  it('submits successful request with proofUrl', async () => {
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);
    mockPrisma.subscriptionTransferRequest.create.mockResolvedValue(
      publicRow(),
    );

    const res = await service.createRequest(userId, {
      provider: 'OtherVPN',
      expiryDate: futureExpiry,
      proofUrl: 'https://example.com/p.png',
    });

    expect(res.success).toBe(true);
    expect(res.data?.status).toBe(TransferRequestStatus.PENDING);
    expect(mockPrisma.subscriptionTransferRequest.create).toHaveBeenCalled();
    expect(mockTransferS3.verifyUploadedProofObject).not.toHaveBeenCalled();
  });

  it('submits successful request with proofS3Key after S3 verify', async () => {
    const key = `membership-transfer-proofs/${userId}/abc.jpg`;
    mockTransferS3.verifyUploadedProofObject.mockResolvedValue({
      contentType: 'image/jpeg',
      sizeBytes: 1200,
      sha256Hex: 'deadbeef'.repeat(8),
      uploadedAt: new Date(),
    });
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);
    mockPrisma.subscriptionTransferRequest.create.mockResolvedValue(
      publicRow({
        proofUrl: `s3://test-bucket/${key}`,
        proofMimeType: 'image/jpeg',
      }),
    );

    const res = await service.createRequest(userId, {
      provider: 'OtherVPN',
      expiryDate: futureExpiry,
      proofS3Key: key,
    });

    expect(res.success).toBe(true);
    expect(mockTransferS3.verifyUploadedProofObject).toHaveBeenCalledWith(
      userId,
      key,
    );
    expect(mockPrisma.subscriptionTransferRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proofUrl: `s3://test-bucket/${key}`,
          proofMimeType: 'image/jpeg',
          proofHash: 'deadbeef'.repeat(8),
          proofSizeBytes: 1200,
        }),
      }),
    );
  });

  it('flags DUPLICATE_PROOF when same proofHash used by another user', async () => {
    const key = `membership-transfer-proofs/${userId}/dup.jpg`;
    const hash = 'a'.repeat(64);
    mockTransferS3.verifyUploadedProofObject.mockResolvedValue({
      contentType: 'image/jpeg',
      sizeBytes: 500,
      sha256Hex: hash,
      uploadedAt: new Date(),
    });
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);
    mockPrisma.subscriptionTransferRequest.findFirst.mockResolvedValue({
      id: 'other-req',
    });
    mockPrisma.subscriptionTransferRequest.create.mockResolvedValue(
      publicRow(),
    );

    await service.createRequest(userId, {
      provider: 'OtherVPN',
      expiryDate: futureExpiry,
      proofS3Key: key,
    });

    expect(mockPrisma.subscriptionTransferRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          riskFlags: expect.arrayContaining([
            MEMBERSHIP_TRANSFER_RISK.DUPLICATE_PROOF,
          ]),
          riskScore: expect.any(Number),
        }),
      }),
    );
    expect(
      mockPrisma.subscriptionTransferRequest.create.mock.calls[0][0].data
        .riskScore,
    ).toBeGreaterThanOrEqual(40);
  });

  it('flags LONG_EXPIRY when competitor expiry is far in the future', async () => {
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);
    mockPrisma.subscriptionTransferRequest.create.mockResolvedValue(
      publicRow(),
    );
    const farExpiry = new Date(Date.now() + 400 * 86400000).toISOString();

    await service.createRequest(userId, {
      provider: 'OtherVPN',
      expiryDate: farExpiry,
      proofUrl: 'https://example.com/p.png',
    });

    expect(mockPrisma.subscriptionTransferRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          riskFlags: expect.arrayContaining([
            MEMBERSHIP_TRANSFER_RISK.LONG_EXPIRY,
          ]),
        }),
      }),
    );
  });

  it('computes riskScore for new account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      createdAt: new Date(),
    });
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);
    mockPrisma.subscriptionTransferRequest.create.mockResolvedValue(
      publicRow(),
    );

    await service.createRequest(userId, {
      provider: 'OtherVPN',
      expiryDate: futureExpiry,
      proofUrl: 'https://example.com/p.png',
    });

    expect(mockPrisma.subscriptionTransferRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          riskFlags: expect.arrayContaining([
            MEMBERSHIP_TRANSFER_RISK.NEW_ACCOUNT,
          ]),
        }),
      }),
    );
  });

  it('rejects invalid MIME from S3 verify', async () => {
    const key = `membership-transfer-proofs/${userId}/bad.bin`;
    mockTransferS3.verifyUploadedProofObject.mockRejectedValue(
      new BadRequestException('Proof must be a JPEG, PNG, or WebP image'),
    );
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);

    await expect(
      service.createRequest(userId, {
        provider: 'OtherVPN',
        expiryDate: futureExpiry,
        proofS3Key: key,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized S3 proof', async () => {
    const key = `membership-transfer-proofs/${userId}/big.jpg`;
    mockTransferS3.verifyUploadedProofObject.mockRejectedValue(
      new BadRequestException(
        'Proof object must exist on S3 and be at most 5MB',
      ),
    );
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);

    await expect(
      service.createRequest(userId, {
        provider: 'OtherVPN',
        expiryDate: futureExpiry,
        proofS3Key: key,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing S3 object', async () => {
    const key = `membership-transfer-proofs/${userId}/missing.jpg`;
    mockTransferS3.verifyUploadedProofObject.mockRejectedValue(
      new BadRequestException('Invalid proof object key'),
    );
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);

    await expect(
      service.createRequest(userId, {
        provider: 'OtherVPN',
        expiryDate: futureExpiry,
        proofS3Key: key,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing proof', async () => {
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);
    await expect(
      service.createRequest(userId, {
        provider: 'OtherVPN',
        expiryDate: futureExpiry,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects past expiry', async () => {
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(null);
    const past = new Date(Date.now() - 86400000).toISOString();
    await expect(
      service.createRequest(userId, {
        provider: 'OtherVPN',
        expiryDate: past,
        proofUrl: 'https://example.com/p.png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks duplicate request', async () => {
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue({
      id: 'existing',
      userId,
      provider: 'X',
      expiryDate: new Date(futureExpiry),
      proofUrl: 'https://x.com/p.png',
      status: TransferRequestStatus.PENDING,
      requestedCreditDays: 10,
      approvedCreditDays: null,
      adminNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
      reviewedByAdminId: null,
    });

    await expect(
      service.createRequest(userId, {
        provider: 'Y',
        expiryDate: futureExpiry,
        proofUrl: 'https://y.com/p.png',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reject requires admin note', async () => {
    await expect(
      service.adminReject('req-1', { adminNote: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.adminReject('req-1', {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejection uses transaction and does not create ledger', async () => {
    const pending = {
      id: 'req-1',
      userId,
      provider: 'Other',
      expiryDate: new Date(futureExpiry),
      proofUrl: 'https://x.com/p.png',
      status: TransferRequestStatus.PENDING,
      requestedCreditDays: 10,
      approvedCreditDays: null,
      adminNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
      reviewedByAdminId: null,
    };
    const rejected = {
      ...pending,
      status: TransferRequestStatus.REJECTED,
      adminNote: 'no',
    };

    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: never) => Promise<unknown>) => {
        return fn({
          subscriptionTransferRequest: {
            findUnique: jest.fn().mockResolvedValue(pending),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(rejected),
          },
        } as never);
      },
    );

    await service.adminReject('req-1', { adminNote: 'no' });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.subscriptionCreditLedger.create).not.toHaveBeenCalled();
  });

  it('approved request cannot be approved again', async () => {
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: never) => Promise<unknown>) => {
        return fn({
          subscriptionTransferRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'req-1',
              userId,
              status: TransferRequestStatus.APPROVED,
              requestedCreditDays: 10,
            }),
            updateMany: jest.fn(),
            findUniqueOrThrow: jest.fn(),
          },
          subscriptionCreditLedger: {
            findUnique: jest.fn(),
            create: jest.fn(),
          },
          subscription: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
          },
          appleIAPPurchase: { findFirst: jest.fn() },
        } as never);
      },
    );

    await expect(
      service.adminApprove('req-1', { approvedCreditDays: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks approve when ledger already exists', async () => {
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: never) => Promise<unknown>) => {
        return fn({
          subscriptionTransferRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'req-1',
              userId,
              status: TransferRequestStatus.PENDING,
              requestedCreditDays: 10,
            }),
            updateMany: jest.fn(),
            findUniqueOrThrow: jest.fn(),
          },
          subscriptionCreditLedger: {
            findUnique: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
            create: jest.fn(),
          },
          subscription: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
          },
          appleIAPPurchase: { findFirst: jest.fn() },
        } as never);
      },
    );

    await expect(
      service.adminApprove('req-1', { approvedCreditDays: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approval extends subscription end beyond prior entitlement (no reduction)', async () => {
    const subId = 'sub-1';
    const periodEnd = new Date('2030-06-01T00:00:00.000Z');
    let newPeriodEnd: Date | undefined;

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const innerTx = {
          subscriptionTransferRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'req-1',
              userId,
              provider: 'Other',
              status: TransferRequestStatus.PENDING,
              requestedCreditDays: 90,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(
              publicRow({
                status: TransferRequestStatus.APPROVED,
                approvedCreditDays: 45,
                proofUrl: 'https://x.com/p.png',
              }),
            ),
          },
          subscriptionCreditLedger: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
          },
          subscription: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: subId,
                userId,
                currentPeriodEnd: periodEnd,
                status: SubscriptionStatus.ACTIVE,
                stripeSubscriptionId: null,
              },
            ]),
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest
              .fn()
              .mockImplementation(
                (args: { data: { currentPeriodEnd: Date } }) => {
                  newPeriodEnd = args.data.currentPeriodEnd;
                  return Promise.resolve({});
                },
              ),
            create: jest.fn(),
          },
          appleIAPPurchase: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        };
        return fn(innerTx as never);
      },
    );

    const res = await service.adminApprove('req-1', {
      approvedCreditDays: 45,
      reviewedByAdminId: 'admin-a',
    });

    expect(res.success).toBe(true);
    expect(newPeriodEnd).toBeDefined();
    expect(newPeriodEnd!.getTime()).toBeGreaterThan(periodEnd.getTime());
  });

  it('approval creates ledger with subscription update in same transaction', async () => {
    const subId = 'sub-1';
    const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    let ledgerCreated = false;
    let subscriptionUpdated = false;

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const innerTx = {
          subscriptionTransferRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'req-1',
              userId,
              provider: 'Other',
              status: TransferRequestStatus.PENDING,
              requestedCreditDays: 90,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(
              publicRow({
                status: TransferRequestStatus.APPROVED,
                approvedCreditDays: 45,
              }),
            ),
          },
          subscriptionCreditLedger: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(() => {
              ledgerCreated = true;
              expect(subscriptionUpdated).toBe(true);
              return {};
            }),
          },
          subscription: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: subId,
                userId,
                currentPeriodEnd: periodEnd,
                status: SubscriptionStatus.ACTIVE,
                stripeSubscriptionId: null,
              },
            ]),
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockImplementation(() => {
              subscriptionUpdated = true;
              return {};
            }),
            create: jest.fn(),
          },
          appleIAPPurchase: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        };
        return fn(innerTx as never);
      },
    );

    await service.adminApprove('req-1', {
      approvedCreditDays: 45,
      reviewedByAdminId: 'admin-a',
    });

    expect(ledgerCreated).toBe(true);
  });

  it('approval rejects credit above requested cap', async () => {
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const innerTx = {
          subscriptionTransferRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'req-1',
              userId,
              provider: 'Other',
              status: TransferRequestStatus.PENDING,
              requestedCreditDays: 10,
            }),
            updateMany: jest.fn(),
            findUniqueOrThrow: jest.fn(),
          },
          subscriptionCreditLedger: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
          },
          subscription: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
            create: jest.fn().mockResolvedValue({ id: 'new-sub' }),
          },
          appleIAPPurchase: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        return fn(innerTx as never);
      },
    );

    await expect(
      service.adminApprove('req-1', { approvedCreditDays: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('inactive user receives new subscription row on approval', async () => {
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const innerTx = {
          subscriptionTransferRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'req-1',
              userId,
              provider: 'Other',
              status: TransferRequestStatus.PENDING,
              requestedCreditDays: 30,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(
              publicRow({
                status: TransferRequestStatus.APPROVED,
                approvedCreditDays: 14,
              }),
            ),
          },
          subscriptionCreditLedger: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
          },
          subscription: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
            create: jest.fn().mockResolvedValue({ id: 'created-sub' }),
          },
          appleIAPPurchase: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        };
        return fn(innerTx as never);
      },
    );

    const res = await service.adminApprove('req-1', {
      approvedCreditDays: 14,
    });
    expect(res.success).toBe(true);
  });

  it('Stripe user gets STRIPE_ALIGNMENT_PENDING on ledger', async () => {
    let ledgerData: { billingAlignmentStatus?: string } | undefined;

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const innerTx = {
          subscriptionTransferRequest: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'req-1',
              userId,
              provider: 'Other',
              status: TransferRequestStatus.PENDING,
              requestedCreditDays: 30,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(
              publicRow({
                status: TransferRequestStatus.APPROVED,
                approvedCreditDays: 10,
              }),
            ),
          },
          subscriptionCreditLedger: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest
              .fn()
              .mockImplementation((args: { data: typeof ledgerData }) => {
                ledgerData = args.data;
                return Promise.resolve({});
              }),
          },
          subscription: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'sub-stripe',
                userId,
                currentPeriodEnd: new Date(Date.now() + 86400000),
                status: SubscriptionStatus.ACTIVE,
                stripeSubscriptionId: 'sub_stripe123',
              },
            ]),
            findFirst: jest.fn().mockResolvedValue({
              id: 'sub-stripe',
              stripeSubscriptionId: 'sub_stripe123',
            }),
            update: jest.fn().mockResolvedValue({}),
            create: jest.fn(),
          },
          appleIAPPurchase: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        };
        return fn(innerTx as never);
      },
    );

    await service.adminApprove('req-1', { approvedCreditDays: 10 });

    expect(ledgerData?.billingAlignmentStatus).toBe('STRIPE_ALIGNMENT_PENDING');
  });

  it('getMyRequest returns approved state with credit days', async () => {
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(
      publicRow({
        status: TransferRequestStatus.APPROVED,
        approvedCreditDays: 42,
        adminNote: null,
      }),
    );
    const res = await service.getMyRequest(userId);
    expect(res.success).toBe(true);
    expect(res.data?.status).toBe(TransferRequestStatus.APPROVED);
    expect(res.data?.approvedCreditDays).toBe(42);
  });

  it('getMyRequest returns rejected with admin reason', async () => {
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue(
      publicRow({
        status: TransferRequestStatus.REJECTED,
        adminNote: 'Proof unreadable',
      }),
    );
    const res = await service.getMyRequest(userId);
    expect(res.data?.status).toBe(TransferRequestStatus.REJECTED);
    expect(res.data?.adminNote).toBe('Proof unreadable');
  });

  it('adminGetProofPayload returns blob when present', async () => {
    const buf = Buffer.from([1, 2, 3]);
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue({
      proofBlob: buf,
      proofMimeType: 'image/png',
    });

    const payload = await service.adminGetProofPayload('req-1');
    expect(payload.contentType).toBe('image/png');
    expect(payload.buffer.equals(buf)).toBe(true);
  });

  it('adminGetProofPayload 404 without blob', async () => {
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue({
      proofBlob: null,
      proofMimeType: null,
    });
    await expect(service.adminGetProofPayload('req-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('adminGetProofView returns presigned URL for s3 proof', async () => {
    const key = `membership-transfer-proofs/${userId}/x.png`;
    mockPrisma.subscriptionTransferRequest.findUnique.mockResolvedValue({
      proofUrl: `s3://test-bucket/${key}`,
      proofBlob: null,
      proofMimeType: null,
    });
    mockTransferS3.parseStorageUrl.mockReturnValue({
      bucket: 'test-bucket',
      key,
    });
    mockTransferS3.createPresignedGetForProofKey.mockResolvedValue(
      'https://s3.example/presigned',
    );

    const res = await service.adminGetProofView('req-1');
    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      kind: 'presigned',
      viewUrl: 'https://s3.example/presigned',
    });
  });
});
