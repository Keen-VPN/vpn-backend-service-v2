import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingAlignmentStatus,
  Prisma,
  SubscriptionStatus,
  TransferRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { addDaysUtc, differenceInCalendarDaysUtc } from './trial-helpers';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import {
  ApproveTransferRequestDto,
  RejectTransferRequestDto,
} from './dto/admin-review-transfer.dto';
import { MembershipTransferS3Service } from './membership-transfer-s3.service';
import { PresignProofUploadDto } from './dto/presign-proof-upload.dto';
import {
  LONG_EXPIRY_THRESHOLD_DAYS,
  MEMBERSHIP_TRANSFER_RISK,
  MembershipTransferRiskFlag,
  NEW_ACCOUNT_MAX_AGE_DAYS,
  RISK_SCORE_CAP,
  RISK_WEIGHT_DEVICE_MATCH,
  RISK_WEIGHT_DUPLICATE_PROOF,
  RISK_WEIGHT_LONG_EXPIRY,
  RISK_WEIGHT_NEW_ACCOUNT,
} from './membership-transfer.constants';

export const MAX_TRANSFER_CREDIT_DAYS = 365;
const AUTO_APPROVE_TRANSFER_THRESHOLD_DAYS = 31;
const AUTO_APPROVE_REVIEWER_ID = 'system_auto_approval';
export const INTERNAL_PROOF_PLACEHOLDER = 'keen-internal:uploaded-proof';

@Injectable()
export class SubscriptionTransferService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MembershipTransferS3Service)
    private readonly transferS3: MembershipTransferS3Service,
  ) {}

  computeRequestedCreditDays(
    expiryDate: Date,
    asOf: Date = new Date(),
  ): number {
    if (expiryDate.getTime() <= asOf.getTime()) {
      return 0;
    }
    const days = differenceInCalendarDaysUtc(expiryDate, asOf);
    return Math.min(MAX_TRANSFER_CREDIT_DAYS, Math.max(1, days));
  }

  async getMyRequest(userId: string) {
    const row = await this.prisma.subscriptionTransferRequest.findUnique({
      where: { userId },
    });
    return {
      success: true,
      data: row ? this.toPublicDto(row) : null,
    };
  }

  async createPresignedProofUpload(userId: string, dto: PresignProofUploadDto) {
    return {
      success: true,
      data: await this.transferS3.createPresignedPutForProof(
        userId,
        dto.contentType,
      ),
    };
  }

  async createRequest(userId: string, dto: CreateTransferRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const expiryDate = new Date(dto.expiryDate);
    if (Number.isNaN(expiryDate.getTime())) {
      throw new BadRequestException('Invalid expiry date');
    }
    const now = new Date();
    if (expiryDate.getTime() <= now.getTime()) {
      throw new BadRequestException('Expiry date must be in the future');
    }
    const contactEmail = dto.contactEmail?.trim().toLowerCase();

    let proofUrl = dto.proofUrl?.trim() ?? '';
    let proofMimeType: string | null = null;
    let proofHash: string | null = null;
    let proofSizeBytes: number | null = null;
    let proofOriginalFilename: string | null = null;
    let proofUploadedAt: Date | null = null;
    const clientFp = dto.clientDeviceFingerprint?.trim() || null;

    const proofS3Key = dto.proofS3Key?.trim();
    if (proofS3Key) {
      const verified = await this.transferS3.verifyUploadedProofObject(
        userId,
        proofS3Key,
      );
      proofUrl = this.transferS3.proofStorageUrl(proofS3Key);
      proofMimeType = verified.contentType;
      proofHash = verified.sha256Hex;
      proofSizeBytes = verified.sizeBytes;
      proofUploadedAt = verified.uploadedAt ?? now;
      proofOriginalFilename = this.sanitizeFilename(dto.proofOriginalFilename);
    } else if (proofUrl) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(proofUrl);
      } catch {
        throw new BadRequestException('proofUrl must be a valid https URL');
      }
      if (parsedUrl.protocol !== 'https:') {
        throw new BadRequestException('proofUrl must use https');
      }
    } else {
      throw new BadRequestException(
        'Proof is required: upload via presigned S3 (proofS3Key) or provide an https proofUrl',
      );
    }

    const requestedCreditDays = this.computeRequestedCreditDays(
      expiryDate,
      now,
    );
    if (requestedCreditDays < 1) {
      throw new BadRequestException(
        'No transferable credit from this expiry date',
      );
    }

    const { flags, score } = await this.computeRiskAssessment({
      userId,
      proofHash,
      expiryDate,
      userCreatedAt: user.createdAt,
      submittedAt: now,
      clientDeviceFingerprint: clientFp,
    });

    const writeData = {
      provider: dto.provider.trim(),
      expiryDate,
      proofUrl,
      proofMimeType,
      proofHash,
      proofSizeBytes,
      proofOriginalFilename,
      proofUploadedAt,
      clientDeviceFingerprint: clientFp,
      riskScore: score,
      riskFlags: flags as unknown as Prisma.InputJsonValue,
      status: TransferRequestStatus.PENDING,
      requestedCreditDays,
      approvedCreditDays: null,
      adminNote: null,
      reviewedAt: null,
      reviewedByAdminId: null,
      billingAlignmentStatus: BillingAlignmentStatus.NOT_REQUIRED,
    } satisfies Prisma.SubscriptionTransferRequestUpdateInput;

    let row: Awaited<
      ReturnType<
        typeof this.prisma.subscriptionTransferRequest.findUniqueOrThrow
      >
    >;
    try {
      row = await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.subscriptionTransferRequest.findUnique({
            where: { userId },
          });
          if (existing && existing.status !== TransferRequestStatus.REJECTED) {
            throw new ConflictException(
              'A membership transfer request already exists for this account',
            );
          }

          if (contactEmail) {
            await tx.user.update({
              where: { id: userId },
              data: { contactEmail },
            });
          }

          let requestId: string;
          if (existing?.status === TransferRequestStatus.REJECTED) {
            const updated = await tx.subscriptionTransferRequest.updateMany({
              where: {
                id: existing.id,
                status: TransferRequestStatus.REJECTED,
              },
              data: writeData,
            });
            if (updated.count !== 1) {
              throw new ConflictException(
                'A membership transfer request already exists for this account',
              );
            }
            requestId = existing.id;
          } else {
            const created = await tx.subscriptionTransferRequest.create({
              data: {
                userId,
                ...writeData,
              },
            });
            requestId = created.id;
          }

          // Re-check duplicate proof inside the write transaction so concurrent
          // submissions cannot bypass the DUPLICATE_PROOF risk signal.
          if (proofHash) {
            const duplicate = await tx.subscriptionTransferRequest.findFirst({
              where: {
                proofHash,
                userId: { not: userId },
              },
              select: { id: true },
            });
            if (
              duplicate &&
              !flags.includes(MEMBERSHIP_TRANSFER_RISK.DUPLICATE_PROOF)
            ) {
              const mergedFlags = [
                ...flags,
                MEMBERSHIP_TRANSFER_RISK.DUPLICATE_PROOF,
              ];
              const mergedScore = Math.min(
                RISK_SCORE_CAP,
                score + RISK_WEIGHT_DUPLICATE_PROOF,
              );
              await tx.subscriptionTransferRequest.update({
                where: { id: requestId },
                data: {
                  riskFlags: mergedFlags as unknown as Prisma.InputJsonValue,
                  riskScore: mergedScore,
                },
              });
            }
          }

          return tx.subscriptionTransferRequest.findUniqueOrThrow({
            where: { id: requestId },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A membership transfer request already exists for this account',
        );
      }
      throw error;
    }

    SafeLogger.info('Membership transfer request created', {
      service: SubscriptionTransferService.name,
      userId,
      requestId: row.id,
      riskScore: score,
      riskFlags: flags,
    });

    if (requestedCreditDays <= AUTO_APPROVE_TRANSFER_THRESHOLD_DAYS) {
      SafeLogger.info('Membership transfer request auto-approved', {
        service: SubscriptionTransferService.name,
        userId,
        requestId: row.id,
        requestedCreditDays,
      });
      return this.adminApprove(
        row.id,
        {
          approvedCreditDays: requestedCreditDays,
          adminNote:
            'Auto-approved: competitor subscription expiry is within 1 month',
        },
        AUTO_APPROVE_REVIEWER_ID,
        {
          action: 'membership_transfer.auto_approved',
          metadata: {
            approvedCreditDays: requestedCreditDays,
            reviewer: AUTO_APPROVE_REVIEWER_ID,
          } as Prisma.InputJsonValue,
        },
      );
    }

    return { success: true, data: this.toPublicDto(row) };
  }

  async adminList(status?: TransferRequestStatus) {
    const rows = await this.prisma.subscriptionTransferRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, createdAt: true } },
        creditLedger: {
          select: { billingAlignmentStatus: true, id: true },
        },
      },
    });
    return {
      success: true,
      data: rows.map((r) => ({
        ...this.toAdminListDto(r),
        userEmail: r.user.email,
        userAccountCreatedAt: r.user.createdAt.toISOString(),
        ledgerBillingAlignmentStatus:
          r.creditLedger?.billingAlignmentStatus ?? null,
      })),
    };
  }

  async adminGetProofPayload(id: string): Promise<{
    buffer: Buffer;
    contentType: string;
  }> {
    const row = await this.prisma.subscriptionTransferRequest.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Transfer request not found');
    }
    if (!row.proofBlob || !row.proofMimeType) {
      throw new NotFoundException('No uploaded proof for this request');
    }
    return {
      buffer: Buffer.from(row.proofBlob),
      contentType: row.proofMimeType,
    };
  }

  /**
   * Returns a short-lived URL to view proof (presigned S3 GET, public https, or legacy blob hint).
   */
  async adminGetProofView(id: string) {
    const row = await this.prisma.subscriptionTransferRequest.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Transfer request not found');
    }

    if (row.proofBlob && row.proofMimeType) {
      return {
        success: true,
        data: {
          kind: 'legacy_blob' as const,
          viewUrl: null,
          binaryPath: `/api/admin/subscription/transfer-requests/${id}/proof`,
        },
      };
    }

    const proofUrl = (row.proofUrl ?? '').trim();
    if (proofUrl.startsWith('s3://')) {
      const parsed = this.transferS3.parseStorageUrl(proofUrl);
      if (
        !parsed ||
        !this.transferS3.enabled() ||
        parsed.bucket !== this.transferS3.getBucket()
      ) {
        throw new BadRequestException('Stored S3 proof URL is invalid');
      }
      const viewUrl = await this.transferS3.createPresignedGetForProofKey(
        parsed.key,
      );
      return {
        success: true,
        data: { kind: 'presigned' as const, viewUrl },
      };
    }

    if (proofUrl.startsWith('https://')) {
      return {
        success: true,
        data: { kind: 'public' as const, viewUrl: proofUrl },
      };
    }

    throw new NotFoundException('No proof available for this request');
  }

  async adminApprove(
    id: string,
    dto: ApproveTransferRequestDto,
    adminUserId: string,
    audit?: {
      action: string;
      ipAddress?: string | null;
      userAgent?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    const adminId = adminUserId;
    const auditAdminUserId =
      adminId === AUTO_APPROVE_REVIEWER_ID ? null : adminId;
    const reviewedAt = new Date();

    const result = await this.prisma.$transaction(
      async (tx) => {
        const row = await tx.subscriptionTransferRequest.findUnique({
          where: { id },
        });
        if (!row) {
          throw new NotFoundException('Transfer request not found');
        }
        if (row.status !== TransferRequestStatus.PENDING) {
          throw new ConflictException('Request is not pending');
        }

        const existingLedger = await tx.subscriptionCreditLedger.findUnique({
          where: { transferRequestId: id },
        });
        if (existingLedger) {
          throw new ConflictException(
            'Transfer credit was already applied for this request',
          );
        }

        const cap = Math.min(row.requestedCreditDays, MAX_TRANSFER_CREDIT_DAYS);
        if (dto.approvedCreditDays > cap) {
          throw new BadRequestException(
            `approvedCreditDays cannot exceed ${cap} for this request`,
          );
        }

        const apply = await this.applyCredit(
          tx,
          row.userId,
          dto.approvedCreditDays,
          reviewedAt,
        );

        const updated = await tx.subscriptionTransferRequest.updateMany({
          where: { id, status: TransferRequestStatus.PENDING },
          data: {
            status: TransferRequestStatus.APPROVED,
            approvedCreditDays: dto.approvedCreditDays,
            adminNote: dto.adminNote?.trim() || null,
            reviewedAt,
            reviewedByAdminId: adminId,
            billingAlignmentStatus: apply.billingAlignmentStatus,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Request is not pending or was already processed',
          );
        }

        await tx.subscriptionCreditLedger.create({
          data: {
            userId: row.userId,
            transferRequestId: id,
            creditDays: dto.approvedCreditDays,
            subscriptionId: apply.subscriptionId,
            previousPeriodEnd: apply.previousPeriodEnd,
            newPeriodEnd: apply.newPeriodEnd,
            createdByAdminId: adminId,
            billingAlignmentStatus: apply.billingAlignmentStatus,
            metadata: {
              provider: row.provider,
              source: 'membership_transfer',
            } as Prisma.InputJsonValue,
          },
        });

        if (audit) {
          await tx.adminAuditLog.create({
            data: {
              adminUserId: auditAdminUserId,
              action: audit.action,
              targetType: 'subscription_transfer_request',
              targetId: id,
              metadata: audit.metadata ?? Prisma.JsonNull,
              ipAddress: audit.ipAddress ?? null,
              userAgent: audit.userAgent ?? null,
            },
          });
        }

        return tx.subscriptionTransferRequest.findUniqueOrThrow({
          where: { id },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    SafeLogger.info('Membership transfer approved', {
      service: SubscriptionTransferService.name,
      requestId: id,
      approvedCreditDays: dto.approvedCreditDays,
    });

    return { success: true, data: this.toPublicDto(result) };
  }

  async adminReject(
    id: string,
    dto: RejectTransferRequestDto,
    adminUserId: string,
    audit?: {
      action: string;
      ipAddress?: string | null;
      userAgent?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    const adminId = adminUserId;
    const note = dto.adminNote?.trim();
    if (!note) {
      throw new BadRequestException('Rejection requires an admin note');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscriptionTransferRequest.findUnique({
        where: { id },
      });
      if (!row) {
        throw new NotFoundException('Transfer request not found');
      }
      if (row.status !== TransferRequestStatus.PENDING) {
        throw new ConflictException('Request is not pending');
      }

      const u = await tx.subscriptionTransferRequest.updateMany({
        where: { id, status: TransferRequestStatus.PENDING },
        data: {
          status: TransferRequestStatus.REJECTED,
          adminNote: note,
          reviewedAt: new Date(),
          reviewedByAdminId: adminId,
        },
      });
      if (u.count !== 1) {
        throw new ConflictException(
          'Request is not pending or was already processed',
        );
      }

      if (audit) {
        await tx.adminAuditLog.create({
          data: {
            adminUserId: adminId,
            action: audit.action,
            targetType: 'subscription_transfer_request',
            targetId: id,
            metadata: audit.metadata ?? Prisma.JsonNull,
            ipAddress: audit.ipAddress ?? null,
            userAgent: audit.userAgent ?? null,
          },
        });
      }

      return tx.subscriptionTransferRequest.findUniqueOrThrow({
        where: { id },
      });
    });

    SafeLogger.info('Membership transfer rejected', {
      service: SubscriptionTransferService.name,
      requestId: id,
    });

    return { success: true, data: this.toPublicDto(updated) };
  }

  private async hasActiveStripeBackedSubscription(
    tx: Prisma.TransactionClient,
    userId: string,
    asOf: Date,
  ): Promise<boolean> {
    const row = await tx.subscription.findFirst({
      where: {
        userId,
        stripeSubscriptionId: { not: null },
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: asOf } }],
      },
    });
    return !!row;
  }

  private resolveBillingAlignmentStatus(
    hasActiveStripe: boolean,
    targetHadStripeId: boolean,
    createdNewSubscription: boolean,
  ): BillingAlignmentStatus {
    if (hasActiveStripe || targetHadStripeId) {
      return BillingAlignmentStatus.STRIPE_ALIGNMENT_PENDING;
    }
    if (createdNewSubscription) {
      return BillingAlignmentStatus.NOT_REQUIRED;
    }
    return BillingAlignmentStatus.LOCAL_ENTITLEMENT_ONLY;
  }

  private async applyCredit(
    tx: Prisma.TransactionClient,
    userId: string,
    approvedCreditDays: number,
    asOf: Date,
  ): Promise<{
    subscriptionId: string | null;
    previousPeriodEnd: Date | null;
    newPeriodEnd: Date;
    billingAlignmentStatus: BillingAlignmentStatus;
  }> {
    const now = asOf;

    const directSubs = await tx.subscription.findMany({
      where: {
        userId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }],
      },
    });

    const iap = await tx.appleIAPPurchase.findFirst({
      where: {
        linkedUserId: userId,
        OR: [{ expiresDate: null }, { expiresDate: { gte: now } }],
      },
      orderBy: { expiresDate: 'desc' },
    });
    const iapEnd =
      iap?.expiresDate && iap.expiresDate > now ? iap.expiresDate : null;

    // Do not treat "null end" subscriptions as mutable targets: they represent
    // indefinite entitlement or externally managed baseline and must not be
    // converted into a time-limited end date by transfer credit.
    const finiteDirectSubs = directSubs.filter(
      (s) => s.currentPeriodEnd != null,
    );

    /** max(current entitlement end, now) across finite subscriptions + IAP */
    let entitlementEnd = now;
    for (const s of finiteDirectSubs) {
      if (s.currentPeriodEnd && s.currentPeriodEnd > entitlementEnd) {
        entitlementEnd = s.currentPeriodEnd;
      }
    }
    if (iapEnd && iapEnd > entitlementEnd) {
      entitlementEnd = iapEnd;
    }

    const newPeriodEnd = addDaysUtc(entitlementEnd, approvedCreditDays);

    let targetSub: (typeof directSubs)[0] | null = null;
    if (finiteDirectSubs.length > 0) {
      targetSub = finiteDirectSubs.reduce((a, b) =>
        a.currentPeriodEnd!.getTime() >= b.currentPeriodEnd!.getTime() ? a : b,
      );
    }

    const hasStripe = await this.hasActiveStripeBackedSubscription(
      tx,
      userId,
      now,
    );

    if (targetSub) {
      const previousPeriodEnd = targetSub.currentPeriodEnd;
      const targetHadStripeId = !!targetSub.stripeSubscriptionId;
      await tx.subscription.update({
        where: { id: targetSub.id },
        data: {
          currentPeriodEnd: newPeriodEnd,
          status: SubscriptionStatus.ACTIVE,
          cancelAtPeriodEnd: false,
        },
      });
      return {
        subscriptionId: targetSub.id,
        previousPeriodEnd,
        newPeriodEnd,
        billingAlignmentStatus: this.resolveBillingAlignmentStatus(
          hasStripe,
          targetHadStripeId,
          false,
        ),
      };
    }

    const created = await tx.subscription.create({
      data: {
        userId,
        status: SubscriptionStatus.ACTIVE,
        subscriptionType: 'membership_transfer',
        planName: 'Membership Transfer',
        currentPeriodStart: now,
        currentPeriodEnd: newPeriodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    return {
      subscriptionId: created.id,
      previousPeriodEnd: null,
      newPeriodEnd,
      billingAlignmentStatus: this.resolveBillingAlignmentStatus(
        hasStripe,
        false,
        true,
      ),
    };
  }

  private sanitizeFilename(input: string | undefined): string | null {
    if (!input) return null;
    const t = input
      .trim()
      .replace(/[/\\]/g, '_')
      .replace(/[^\w.\- ()[\]]+/g, '_')
      .slice(0, 255);
    return t.length > 0 ? t : null;
  }

  private async computeRiskAssessment(args: {
    userId: string;
    proofHash: string | null;
    expiryDate: Date;
    userCreatedAt: Date;
    submittedAt: Date;
    clientDeviceFingerprint: string | null;
  }): Promise<{ flags: MembershipTransferRiskFlag[]; score: number }> {
    const flags: MembershipTransferRiskFlag[] = [];
    let score = 0;

    if (args.proofHash) {
      const dup = await this.prisma.subscriptionTransferRequest.findFirst({
        where: {
          proofHash: args.proofHash,
          userId: { not: args.userId },
        },
        select: { id: true },
      });
      if (dup) {
        flags.push(MEMBERSHIP_TRANSFER_RISK.DUPLICATE_PROOF);
        score += RISK_WEIGHT_DUPLICATE_PROOF;
      }
    }

    const longThreshold = addDaysUtc(
      args.submittedAt,
      LONG_EXPIRY_THRESHOLD_DAYS,
    );
    if (args.expiryDate.getTime() > longThreshold.getTime()) {
      flags.push(MEMBERSHIP_TRANSFER_RISK.LONG_EXPIRY);
      score += RISK_WEIGHT_LONG_EXPIRY;
    }

    const accountAgeMs =
      args.submittedAt.getTime() - args.userCreatedAt.getTime();
    const accountAgeDays = accountAgeMs / (86400 * 1000);
    if (accountAgeDays < NEW_ACCOUNT_MAX_AGE_DAYS) {
      flags.push(MEMBERSHIP_TRANSFER_RISK.NEW_ACCOUNT);
      score += RISK_WEIGHT_NEW_ACCOUNT;
    }

    if (args.clientDeviceFingerprint) {
      const fp = args.clientDeviceFingerprint;
      const [tg, dtf, pt] = await Promise.all([
        this.prisma.trialGrant.findFirst({
          where: { deviceHash: fp, userId: { not: args.userId } },
          select: { id: true },
        }),
        this.prisma.deviceTrialFingerprint.findFirst({
          where: { hash: fp, userId: { not: args.userId } },
          select: { id: true },
        }),
        this.prisma.pushToken.findFirst({
          where: {
            deviceHash: fp,
            userId: { not: args.userId },
          },
          select: { id: true },
        }),
      ]);
      if (tg || dtf || pt) {
        flags.push(MEMBERSHIP_TRANSFER_RISK.MULTIPLE_ACCOUNT_DEVICE_MATCH);
        score += RISK_WEIGHT_DEVICE_MATCH;
      }
    }

    return {
      flags,
      score: Math.min(RISK_SCORE_CAP, score),
    };
  }

  private toPublicDto(row: {
    id: string;
    userId: string;
    provider: string;
    expiryDate: Date;
    proofUrl: string;
    proofBlob?: Uint8Array | null;
    status: TransferRequestStatus;
    requestedCreditDays: number;
    approvedCreditDays: number | null;
    adminNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
    reviewedByAdminId: string | null;
  }) {
    const isS3 = row.proofUrl.startsWith('s3://');
    const isLegacyBlob =
      row.proofUrl === INTERNAL_PROOF_PLACEHOLDER &&
      row.proofBlob != null &&
      (row.proofBlob as Buffer).length > 0;
    return {
      id: row.id,
      provider: row.provider,
      expiryDate: row.expiryDate.toISOString(),
      proofUrl: isS3
        ? 'keen-s3:proof'
        : row.proofUrl === INTERNAL_PROOF_PLACEHOLDER
          ? INTERNAL_PROOF_PLACEHOLDER
          : row.proofUrl,
      hasUploadedProof: isS3 || isLegacyBlob,
      hasS3Proof: isS3,
      status: row.status,
      requestedCreditDays: row.requestedCreditDays,
      approvedCreditDays: row.approvedCreditDays,
      adminNote: row.adminNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedBySystem: row.reviewedByAdminId === AUTO_APPROVE_REVIEWER_ID,
    };
  }

  private toAdminListDto(row: {
    id: string;
    userId: string;
    provider: string;
    expiryDate: Date;
    proofUrl: string;
    proofBlob?: Uint8Array | null;
    proofMimeType: string | null;
    proofHash: string | null;
    proofSizeBytes: number | null;
    proofOriginalFilename: string | null;
    proofUploadedAt: Date | null;
    clientDeviceFingerprint: string | null;
    riskScore: number;
    riskFlags: Prisma.JsonValue;
    status: TransferRequestStatus;
    requestedCreditDays: number;
    approvedCreditDays: number | null;
    adminNote: string | null;
    billingAlignmentStatus: BillingAlignmentStatus;
    createdAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
    reviewedByAdminId: string | null;
  }) {
    const flags = this.parseRiskFlagsJson(row.riskFlags);
    return {
      userId: row.userId,
      ...this.toPublicDto(row),
      reviewedByAdminId: row.reviewedByAdminId,
      riskScore: row.riskScore,
      riskFlags: flags,
      proofMetadata: {
        mimeType: row.proofMimeType,
        sizeBytes: row.proofSizeBytes,
        originalFilename: row.proofOriginalFilename,
        uploadedAt: row.proofUploadedAt?.toISOString() ?? null,
        proofHashPrefix: row.proofHash ? row.proofHash.slice(0, 12) : null,
      },
      billingAlignmentStatus: row.billingAlignmentStatus,
    };
  }

  private parseRiskFlagsJson(value: Prisma.JsonValue): string[] {
    if (value == null) return [];
    if (Array.isArray(value)) {
      return value.filter((x): x is string => typeof x === 'string');
    }
    return [];
  }
}
