/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SubscriptionStatus,
  Prisma,
  SubscriptionUserRole,
} from '@prisma/client';
import { SafeLogger } from '../../common/utils/logger.util';
import { TrialService } from '../../subscription/trial.service';
import { PaidConversionSlackService } from '../../notification/paid-conversion-slack.service';

const APPLE_RECEIPT_URLS = {
  sandbox: 'https://sandbox.itunes.apple.com/verifyReceipt',
  production: 'https://buy.itunes.apple.com/verifyReceipt',
};

type AppleEnvironment = 'Sandbox' | 'Production';

interface AppleReceiptItem {
  transaction_id: string;
  original_transaction_id: string;
  product_id: string;
  purchase_date_ms: string;
  expires_date_ms?: string;
  is_trial_period?: string;
}

interface AppleVerifyReceiptResponse {
  status: number;
  // Apple may return arbitrary environment strings; we normalise to AppleEnvironment where needed.
  environment?: string;
  // Subscription receipts use latest_receipt_info
  latest_receipt_info?: AppleReceiptItem[];
  // Some receipts provide receipt.in_app
  receipt?: {
    in_app?: AppleReceiptItem[];
  };
  // Present for subscription receipts
  latest_receipt?: string;
}

type AppleWebhookNotificationType =
  | 'REFUND'
  | 'DID_RENEW'
  | 'DID_CHANGE_RENEWAL_STATUS';

interface AppleWebhookEvent {
  notification_type?: AppleWebhookNotificationType;
  auto_renew_status?: boolean;
  unified_receipt?: {
    environment?: AppleEnvironment;
    latest_receipt_info?: AppleReceiptItem[];
  };
}

type BillingPeriod = 'month' | 'year' | 'unknown';

interface PlanMetadata {
  planName: string;
  priceAmount: number | null;
  priceCurrency: 'USD';
  billingPeriod: BillingPeriod;
}

@Injectable()
export class AppleService {
  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(forwardRef(() => TrialService))
    private trialService: TrialService,
    @Inject(PaidConversionSlackService)
    private readonly paidConversionSlackService: PaidConversionSlackService,
  ) {}

  async verifyReceipt(
    receiptData: string,
  ): Promise<AppleVerifyReceiptResponse> {
    const sharedSecret =
      this.configService?.get<string>('APPLE_SHARED_SECRET') ||
      process.env.APPLE_SHARED_SECRET;

    try {
      const body = JSON.stringify({
        'receipt-data': receiptData,
        password: sharedSecret || '',
        'exclude-old-transactions': true,
      });

      // Try production first
      let response = await fetch(APPLE_RECEIPT_URLS.production, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      let result = await this.safeParseAppleJSON(response);

      // If production returns sandbox error, try sandbox
      if (result.status === 21007) {
        SafeLogger.info('Production receipt failed, trying sandbox');
        response = await fetch(APPLE_RECEIPT_URLS.sandbox, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        result = await this.safeParseAppleJSON(response);
      }

      return result;
    } catch (error) {
      SafeLogger.error('Error verifying Apple receipt', error);
      throw error;
    }
  }

  async handleWebhookEvent(event: AppleWebhookEvent) {
    SafeLogger.info('Processing Apple webhook', {
      notificationType: event.notification_type,
      unifiedReceipt: !!event.unified_receipt,
    });

    // Handle different notification types
    switch (event.notification_type) {
      case 'REFUND':
        await this.handleRefund(event);
        break;
      case 'DID_RENEW':
        await this.handleRenewal(event);
        break;
      case 'DID_CHANGE_RENEWAL_STATUS':
        await this.handleRenewalStatusChange(event);
        break;
      default:
        SafeLogger.warn('Unhandled Apple webhook event', {
          notificationType: event.notification_type,
        });
    }
  }

  private async handleRefund(event: AppleWebhookEvent) {
    // Handle refund - mark subscription as cancelled
    const unifiedReceipt = event.unified_receipt;
    const latestReceipt = this.findLatestReceiptItem(
      unifiedReceipt?.latest_receipt_info,
    );
    if (latestReceipt) {
      const originalTransactionId = latestReceipt.original_transaction_id;

      const subscription = await this.prisma.subscription.findFirst({
        where: { appleOriginalTransactionId: originalTransactionId },
      });

      if (subscription) {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.CANCELLED,
            cancelledAt: new Date(),
          },
        });
      }
    }
  }

  private async handleRenewal(event: AppleWebhookEvent) {
    // Handle subscription renewal
    const unifiedReceipt = event.unified_receipt;
    const latestReceipt = this.findLatestReceiptItem(
      unifiedReceipt?.latest_receipt_info,
    );
    if (!latestReceipt) return;
    await this.processAppleReceipt(latestReceipt, unifiedReceipt?.environment);
  }

  private async handleRenewalStatusChange(event: AppleWebhookEvent) {
    // Handle auto-renewal status change
    const unifiedReceipt = event.unified_receipt;
    const latestReceipt = this.findLatestReceiptItem(
      unifiedReceipt?.latest_receipt_info,
    );
    if (latestReceipt) {
      const originalTransactionId = latestReceipt.original_transaction_id;

      const subscription = await this.prisma.subscription.findFirst({
        where: { appleOriginalTransactionId: originalTransactionId },
      });

      if (subscription) {
        // Update cancel_at_period_end based on auto-renew status
        const autoRenewStatus = event.auto_renew_status;
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            cancelAtPeriodEnd: !autoRenewStatus,
          },
        });
      }
    }
  }

  private async processAppleReceipt(
    receipt: AppleReceiptItem,
    environment?: AppleEnvironment,
  ) {
    const originalTransactionId = receipt.original_transaction_id;
    const transactionId = receipt.transaction_id;
    const productId = receipt.product_id;

    // Find user by linked purchase or create/update subscription
    const purchase = await this.prisma.appleIAPPurchase.findUnique({
      where: { originalTransactionId },
      include: { linkedUser: true },
    });

    if (!purchase || !purchase.linkedUser) {
      SafeLogger.warn('Apple receipt not linked to user', {
        originalTransactionId,
      });
      return;
    }

    const userId = purchase.linkedUser.id;
    const purchaseDate = new Date(parseInt(receipt.purchase_date_ms));
    const expiresDate = receipt.expires_date_ms
      ? new Date(parseInt(receipt.expires_date_ms))
      : null;

    const plan = this.resolvePlanMetadata(productId);
    const nextStatus = this.getExpectedSubscriptionStatus(expiresDate);

    // Renewals share originalTransactionId; prefer that for lineage.
    const txResult = await this.prisma.$transaction(async (tx) => {
      const existing =
        (await tx.subscription.findFirst({
          where: { appleOriginalTransactionId: originalTransactionId },
        })) ??
        (await tx.subscription.findFirst({
          where: { appleTransactionId: transactionId },
        }));

      if (!existing) {
        const newSubscription = await tx.subscription.create({
          data: {
            userId,
            subscriptionType: 'apple_iap',
            appleTransactionId: transactionId,
            appleOriginalTransactionId: originalTransactionId,
            appleProductId: productId,
            appleEnvironment: environment ?? purchase.environment ?? null,
            status: nextStatus,
            planId: productId,
            planName: plan.planName,
            priceAmount: plan.priceAmount ?? 0,
            priceCurrency: plan.priceCurrency,
            billingPeriod: plan.billingPeriod,
            currentPeriodStart: purchaseDate,
            currentPeriodEnd: expiresDate || undefined,
            cancelAtPeriodEnd: false,
          },
        });
        try {
          await tx.subscriptionUser.create({
            data: {
              subscriptionId: newSubscription.id,
              userId,
              role: SubscriptionUserRole.OWNER,
            },
          });
        } catch (e: unknown) {
          if (
            !(
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'
            )
          )
            throw e;
        }
        return { subscriptionId: newSubscription.id, created: true };
      }

      const needsUpdate =
        existing.status !== nextStatus ||
        existing.appleTransactionId !== transactionId ||
        existing.appleProductId !== productId ||
        (expiresDate &&
          existing.currentPeriodEnd?.getTime() !== expiresDate.getTime());

      if (!needsUpdate) return { subscriptionId: existing.id, created: false };

      await tx.subscription.update({
        where: { id: existing.id },
        data: {
          appleTransactionId: transactionId,
          appleProductId: productId,
          appleEnvironment:
            environment ?? purchase.environment ?? existing.appleEnvironment,
          status: nextStatus,
          planId: productId,
          planName: plan.planName,
          priceAmount: plan.priceAmount ?? existing.priceAmount,
          priceCurrency: plan.priceCurrency,
          billingPeriod: plan.billingPeriod,
          currentPeriodEnd: expiresDate || undefined,
        },
      });
      return { subscriptionId: existing.id, created: false };
    });

    // Auto-create LINKED mappings for linked accounts (outside transaction)
    if (txResult.created) {
      const linkedAccounts = await this.prisma.linkedAccount.findMany({
        where: { OR: [{ primaryUserId: userId }, { linkedUserId: userId }] },
      });
      for (const link of linkedAccounts) {
        const linkedUserId =
          link.primaryUserId === userId
            ? link.linkedUserId
            : link.primaryUserId;
        try {
          await this.prisma.subscriptionUser.create({
            data: {
              subscriptionId: txResult.subscriptionId,
              userId: linkedUserId,
              role: SubscriptionUserRole.LINKED,
            },
          });
        } catch (e: unknown) {
          if (
            !(
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'
            )
          )
            throw e;
        }
      }
    }

    if (
      txResult.created &&
      (nextStatus === SubscriptionStatus.ACTIVE ||
        nextStatus === SubscriptionStatus.TRIALING)
    ) {
      await this.maybeGrantTrialAfterAppleIap(userId, null, productId);
    }

    if (
      nextStatus === SubscriptionStatus.ACTIVE &&
      !this.isAppleTrialPeriodReceipt(receipt)
    ) {
      try {
        await this.maybeNotifyApplePaidConversion(
          userId,
          originalTransactionId,
          productId,
        );
      } catch (paidErr) {
        SafeLogger.warn(
          'Apple paid-conversion Slack skipped (non-fatal)',
          undefined,
          {
            userId,
            error: paidErr instanceof Error ? paidErr.message : String(paidErr),
          },
        );
      }
    }
  }

  private describeAppleTrialPlan(plan: PlanMetadata): string {
    if (plan.billingPeriod === 'month') {
      return 'Monthly trial';
    }
    if (plan.billingPeriod === 'year') {
      return 'Annual trial';
    }
    return `${plan.planName} (trial)`;
  }

  private async maybeGrantTrialAfterAppleIap(
    userId: string,
    deviceFingerprint: string | null | undefined,
    productId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const plan = this.resolvePlanMetadata(productId);
    try {
      await this.trialService.grantIfEligible(
        { id: user.id, email: user.email, provider: user.provider },
        deviceFingerprint ?? null,
        {
          billingChannel: 'apple',
          planLabel: this.describeAppleTrialPlan(plan),
        },
      );
    } catch (trialError) {
      SafeLogger.warn(
        'Failed to grant trial after Apple IAP (non-fatal)',
        undefined,
        {
          userId,
          error:
            trialError instanceof Error
              ? trialError.message
              : String(trialError),
        },
      );
    }
  }

  private async maybeNotifyApplePaidConversion(
    userId: string,
    originalTransactionId: string,
    productId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return;
    }

    const plan = this.resolvePlanMetadata(productId);
    const billingPeriod =
      plan.billingPeriod === 'month' || plan.billingPeriod === 'year'
        ? plan.billingPeriod
        : null;

    await this.paidConversionSlackService.maybeNotifyApplePaidConversion({
      userId,
      userEmail: user.email,
      originalTransactionId,
      billingPeriod,
    });
  }

  private resolvePlanMetadata(productId: string): PlanMetadata {
    const id = productId.toLowerCase();
    if (id.includes('monthly') || id.includes('.month')) {
      return {
        planName: 'Premium VPN - Monthly',
        priceAmount: 12.99,
        priceCurrency: 'USD',
        billingPeriod: 'month',
      };
    }
    if (
      id.includes('annual') ||
      id.includes('yearly') ||
      id.includes('.year')
    ) {
      return {
        planName: 'Premium VPN - Annual',
        priceAmount: 130.99,
        priceCurrency: 'USD',
        billingPeriod: 'year',
      };
    }
    // Unknown product; keep explicit "unknown" so we don't silently store wrong billingPeriod.
    return {
      planName: 'Premium VPN',
      priceAmount: null,
      priceCurrency: 'USD',
      billingPeriod: 'unknown',
    };
  }

  private getExpectedSubscriptionStatus(
    expiresDate: Date | null,
  ): SubscriptionStatus {
    return expiresDate && expiresDate > new Date()
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.INACTIVE;
  }

  private findLatestReceiptItem(
    items?: AppleReceiptItem[],
  ): AppleReceiptItem | null {
    if (!items || items.length === 0) return null;
    // Choose the item with the latest expiration if present, otherwise latest purchase date.
    return [...items].sort((a, b) => {
      const aExp = a.expires_date_ms ? parseInt(a.expires_date_ms) : -1;
      const bExp = b.expires_date_ms ? parseInt(b.expires_date_ms) : -1;
      if (aExp !== bExp) return bExp - aExp;
      return parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms);
    })[0];
  }

  private isAppleTrialPeriodReceipt(receipt: AppleReceiptItem): boolean {
    return receipt.is_trial_period === 'true';
  }

  private async shouldNotifyPaidFromStoredAppleReceipt(purchase: {
    receiptData: string | null;
    originalTransactionId: string;
  }): Promise<boolean> {
    // Verification is best-effort only; it should not block notifications.
    if (!purchase.receiptData) {
      return true;
    }

    try {
      const verify = await this.verifyReceipt(
        this.normalizeReceiptData(purchase.receiptData),
      );
      if (verify.status !== 0) {
        return true;
      }

      const latest =
        this.findLatestReceiptItem(verify.latest_receipt_info) ??
        this.findLatestReceiptItem(verify.receipt?.in_app);
      if (!latest) {
        return true;
      }

      // Ensure we are evaluating the same subscription lineage.
      if (latest.original_transaction_id !== purchase.originalTransactionId) {
        return true;
      }

      return !this.isAppleTrialPeriodReceipt(latest);
    } catch {
      return true;
    }
  }

  private extractVerifiedReceiptItem(
    verify: AppleVerifyReceiptResponse,
  ): AppleReceiptItem {
    const item =
      this.findLatestReceiptItem(verify.latest_receipt_info) ??
      this.findLatestReceiptItem(verify.receipt?.in_app);
    if (!item) {
      throw new Error(
        'Apple receipt verification succeeded but contained no transactions.',
      );
    }
    return item;
  }

  private assertVerifiedTransactionMatchesInput(params: {
    inputTransactionId?: string;
    inputOriginalTransactionId?: string;
    inputProductId?: string;
    verified: AppleReceiptItem;
  }): void {
    const {
      inputTransactionId,
      inputOriginalTransactionId,
      inputProductId,
      verified,
    } = params;
    if (inputTransactionId && inputTransactionId !== verified.transaction_id) {
      throw new Error('Transaction ID does not match verified receipt.');
    }
    if (
      inputOriginalTransactionId &&
      inputOriginalTransactionId !== verified.original_transaction_id
    ) {
      throw new Error(
        'Original transaction ID does not match verified receipt.',
      );
    }
    if (inputProductId && inputProductId !== verified.product_id) {
      throw new Error('Product ID does not match verified receipt.');
    }
  }

  private async safeParseAppleJSON(
    response: Response,
  ): Promise<AppleVerifyReceiptResponse> {
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Apple verifyReceipt HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`,
      );
    }
    const text = await response.text();
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as any).status !== 'number'
      ) {
        throw new Error('Invalid verifyReceipt response shape');
      }
      return parsed as AppleVerifyReceiptResponse;
    } catch (e) {
      throw new Error(
        `Failed to parse verifyReceipt response JSON: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
    }
  }

  private normalizeReceiptData(receiptData: string): string {
    const trimmed = receiptData.trim();
    const compact = trimmed.replace(/\s+/g, '');

    // StoreKit 2 transactions are JWS strings like: <header>.<payload>.<signature>
    // Apple's /verifyReceipt expects the base64-encoded app receipt, not a JWS.
    const jwsLike = compact.split('.').length === 3 && compact.length > 0;
    if (jwsLike) {
      throw new Error(
        'Invalid receipt data: looks like a StoreKit 2 signed transaction (JWS). Send the base64-encoded app receipt instead.',
      );
    }

    // Basic sanity check: verifyReceipt expects base64 (not base64url).
    // Allow "=" padding; reject other characters.
    if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length < 20) {
      throw new Error(
        'Invalid receipt data: must be base64-encoded app receipt (from appStoreReceiptURL).',
      );
    }

    return compact;
  }

  private describeAppleVerifyReceiptStatus(status: number): string {
    // https://developer.apple.com/documentation/appstorereceipts/status
    switch (status) {
      case 21000:
        return 'The App Store could not read the JSON object you provided.';
      case 21002:
        return 'The data in the receipt-data property was malformed or missing.';
      case 21003:
        return 'The receipt could not be authenticated.';
      case 21004:
        return 'The shared secret you provided does not match the shared secret on file for your account.';
      case 21005:
        return 'The receipt server is not currently available.';
      case 21006:
        return 'This receipt is valid but the subscription has expired.';
      case 21007:
        return 'This receipt is from the test environment, but it was sent to the production environment.';
      case 21008:
        return 'This receipt is from the production environment, but it was sent to the test environment.';
      default:
        return 'Receipt verification failed with a non-zero status.';
    }
  }

  async capturePurchase(
    transactionId: string,
    originalTransactionId: string,
    productId: string,
    purchaseDateMs: string,
    expiresDateMs: string | undefined,
    receiptData: string | undefined,
    _environment: string | undefined,
    deviceFingerprint?: string,
    _devicePlatform?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ) {
    try {
      // Verify device fingerprint if provided
      if (deviceFingerprint) {
        // Check if this transaction was already captured from a different device
        const existing = await this.prisma.appleIAPPurchase.findUnique({
          where: { transactionId },
        });

        if (existing && existing.linkedUserId) {
          // Transaction already linked to a user, check device
          // For now, we allow multiple devices for the same purchase
          // but log it for security monitoring
          SafeLogger.warn('Purchase captured from different device', {
            transactionId,
            existingDevice: existing.linkedEmail ? '[REDACTED]' : 'unknown',
            newDevice: deviceFingerprint.substring(0, 16) + '...',
          });
        }
      }

      // Prefer verified receipt data when available, but do not block capture on verification failure.
      const normalizedReceipt = receiptData
        ? this.normalizeReceiptData(receiptData)
        : null;

      let verifiedTransactionId = transactionId;
      let verifiedOriginalTransactionId = originalTransactionId;
      let verifiedProductId = productId;
      let verifiedPurchaseDate = new Date(parseInt(purchaseDateMs));
      let verifiedExpiresDate =
        expiresDateMs && expiresDateMs.trim().length > 0
          ? new Date(parseInt(expiresDateMs))
          : null;
      let verifiedEnv: string | null = _environment ?? null;

      if (normalizedReceipt) {
        try {
          const receiptResponse = await this.verifyReceipt(normalizedReceipt);
          if (receiptResponse.status === 0) {
            const verifiedItem =
              this.extractVerifiedReceiptItem(receiptResponse);
            this.assertVerifiedTransactionMatchesInput({
              inputTransactionId: transactionId,
              inputOriginalTransactionId: originalTransactionId,
              inputProductId: productId,
              verified: verifiedItem,
            });

            verifiedPurchaseDate = new Date(
              parseInt(verifiedItem.purchase_date_ms),
            );
            verifiedExpiresDate = verifiedItem.expires_date_ms
              ? new Date(parseInt(verifiedItem.expires_date_ms))
              : null;
            verifiedEnv = receiptResponse.environment ?? verifiedEnv;

            verifiedTransactionId = verifiedItem.transaction_id;
            verifiedOriginalTransactionId =
              verifiedItem.original_transaction_id;
            verifiedProductId = verifiedItem.product_id;
          } else {
            SafeLogger.warn(
              'Apple receipt verification failed during capturePurchase; capturing unverified purchase',
              {
                status: receiptResponse.status,
                environment: receiptResponse.environment,
                transactionId,
              },
            );
          }
        } catch (verifyError) {
          SafeLogger.warn(
            'Apple receipt verification threw during capturePurchase; capturing unverified purchase',
            {
              transactionId,
              error:
                verifyError instanceof Error
                  ? verifyError.message
                  : String(verifyError),
            },
          );
        }
      } else {
        SafeLogger.warn(
          'No receiptData provided to capturePurchase; capturing unverified purchase',
          { transactionId },
        );
      }

      await this.prisma.$transaction(async (tx) => {
        // Upsert by transactionId (unique) and ensure originalTransactionId is consistent.
        const existing = await tx.appleIAPPurchase.findUnique({
          where: { transactionId: verifiedTransactionId },
        });

        if (existing) {
          await tx.appleIAPPurchase.update({
            where: { transactionId: verifiedTransactionId },
            data: {
              originalTransactionId: verifiedOriginalTransactionId,
              productId: verifiedProductId,
              purchaseDate: verifiedPurchaseDate,
              expiresDate: verifiedExpiresDate,
              receiptData: normalizedReceipt ?? existing.receiptData,
              environment: verifiedEnv,
            },
          });
          return;
        }

        // If a row exists under originalTransactionId (renewals), update it to latest transactionId.
        const existingByOriginal = await tx.appleIAPPurchase.findUnique({
          where: { originalTransactionId: verifiedOriginalTransactionId },
        });
        if (existingByOriginal) {
          await tx.appleIAPPurchase.update({
            where: { originalTransactionId: verifiedOriginalTransactionId },
            data: {
              transactionId: verifiedTransactionId,
              productId: verifiedProductId,
              purchaseDate: verifiedPurchaseDate,
              expiresDate: verifiedExpiresDate,
              receiptData: normalizedReceipt ?? existingByOriginal.receiptData,
              environment: verifiedEnv,
            },
          });
          return;
        }

        await tx.appleIAPPurchase.create({
          data: {
            transactionId: verifiedTransactionId,
            originalTransactionId: verifiedOriginalTransactionId,
            productId: verifiedProductId,
            environment: verifiedEnv,
            purchaseDate: verifiedPurchaseDate,
            expiresDate: verifiedExpiresDate,
            receiptData: normalizedReceipt ?? undefined,
          },
        });
      });

      SafeLogger.info('Apple IAP purchase captured', {
        transactionId: verifiedTransactionId,
        productId: verifiedProductId,
      });

      return { success: true, message: 'Purchase captured successfully' };
    } catch (error) {
      SafeLogger.error('Error capturing Apple IAP purchase', error);
      throw error;
    }
  }

  async linkPurchase(
    userId: string,
    _sessionToken: string,
    transactionId: string,
    originalTransactionId: string,
    productId: string,
    receiptData: string,
    deviceFingerprint?: string,
    _devicePlatform?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ) {
    try {
      // Verify device fingerprint if provided
      if (deviceFingerprint) {
        SafeLogger.info('Linking purchase with device verification', {
          transactionId,
          deviceFingerprint: deviceFingerprint.substring(0, 16) + '...',
        });
      }

      const normalizedReceipt = this.normalizeReceiptData(receiptData);

      let verifiedItem: AppleReceiptItem | null = null;
      let verifiedTransactionId = transactionId;
      let verifiedOriginalTransactionId = originalTransactionId;
      let verifiedProductId = productId;
      let verifiedPurchaseDate: Date | null = null;
      let verifiedExpiresDate: Date | null = null;
      let verifiedEnv: string | null = null;

      try {
        const verify = await this.verifyReceipt(normalizedReceipt);
        if (verify.status === 0) {
          verifiedItem = this.extractVerifiedReceiptItem(verify);
          this.assertVerifiedTransactionMatchesInput({
            inputTransactionId: transactionId,
            inputOriginalTransactionId: originalTransactionId,
            inputProductId: productId,
            verified: verifiedItem,
          });

          verifiedTransactionId = verifiedItem.transaction_id;
          verifiedOriginalTransactionId = verifiedItem.original_transaction_id;
          verifiedProductId = verifiedItem.product_id;
          verifiedPurchaseDate = new Date(
            parseInt(verifiedItem.purchase_date_ms),
          );
          verifiedExpiresDate = verifiedItem.expires_date_ms
            ? new Date(parseInt(verifiedItem.expires_date_ms))
            : null;
          verifiedEnv = verify.environment ?? null;
        } else {
          SafeLogger.warn(
            'Apple receipt verification failed during linkPurchase; linking anyway using captured data',
            { status: verify.status, transactionId },
          );
        }
      } catch (verifyError) {
        SafeLogger.warn(
          'Apple receipt verification threw during linkPurchase; linking anyway using captured data',
          {
            transactionId,
            error:
              verifyError instanceof Error
                ? verifyError.message
                : String(verifyError),
          },
        );
      }

      const plan = this.resolvePlanMetadata(verifiedProductId);
      const nextStatus =
        this.getExpectedSubscriptionStatus(verifiedExpiresDate);

      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        // Upsert purchase from verified receipt (authoritative).
        const existingPurchase =
          (await tx.appleIAPPurchase.findUnique({
            where: { transactionId: verifiedTransactionId },
          })) ??
          (await tx.appleIAPPurchase.findUnique({
            where: { originalTransactionId: verifiedOriginalTransactionId },
          }));

        if (
          existingPurchase?.linkedUserId &&
          existingPurchase.linkedUserId !== userId
        ) {
          throw new Error(
            'This purchase is already linked to another account. Each purchase can only be linked to one account.',
          );
        }

        const now = new Date();
        const effectivePurchaseDate =
          verifiedPurchaseDate ?? existingPurchase?.purchaseDate ?? now;
        const effectiveExpiresDate =
          verifiedExpiresDate ?? existingPurchase?.expiresDate ?? null;
        const effectiveEnv =
          verifiedEnv ?? existingPurchase?.environment ?? null;

        const purchase = existingPurchase
          ? await tx.appleIAPPurchase.update({
              where: existingPurchase.transactionId
                ? { transactionId: existingPurchase.transactionId }
                : { originalTransactionId: verifiedOriginalTransactionId },
              data: {
                transactionId: verifiedTransactionId,
                originalTransactionId: verifiedOriginalTransactionId,
                productId: verifiedProductId,
                purchaseDate: effectivePurchaseDate,
                expiresDate: effectiveExpiresDate,
                receiptData: normalizedReceipt,
                environment: effectiveEnv,
                linkedUserId: userId,
                linkedEmail: user.email,
                linkedAt: now,
              },
            })
          : await tx.appleIAPPurchase.create({
              data: {
                transactionId: verifiedTransactionId,
                originalTransactionId: verifiedOriginalTransactionId,
                productId: verifiedProductId,
                purchaseDate: effectivePurchaseDate,
                expiresDate: effectiveExpiresDate,
                receiptData: normalizedReceipt,
                environment: effectiveEnv,
                linkedUserId: userId,
                linkedEmail: user.email,
                linkedAt: now,
              },
            });

        // Idempotent subscription upsert: prefer originalTransactionId lineage.
        const existingSubscription =
          (await tx.subscription.findFirst({
            where: {
              appleOriginalTransactionId: verifiedOriginalTransactionId,
            },
          })) ??
          (await tx.subscription.findFirst({
            where: { appleTransactionId: verifiedTransactionId },
          }));

        const statusFromPurchase = this.getExpectedSubscriptionStatus(
          purchase.expiresDate ?? null,
        );

        const subscription = existingSubscription
          ? await tx.subscription.update({
              where: { id: existingSubscription.id },
              data: {
                userId,
                appleTransactionId: verifiedTransactionId,
                appleOriginalTransactionId: verifiedOriginalTransactionId,
                appleProductId: verifiedProductId,
                appleEnvironment:
                  purchase.environment ?? existingSubscription.appleEnvironment,
                status: statusFromPurchase ?? nextStatus,
                planId: verifiedProductId,
                planName: plan.planName,
                priceAmount:
                  plan.priceAmount ?? existingSubscription.priceAmount,
                priceCurrency: plan.priceCurrency,
                billingPeriod: plan.billingPeriod,
                currentPeriodStart: purchase.purchaseDate,
                currentPeriodEnd: purchase.expiresDate || undefined,
                cancelAtPeriodEnd: false,
              },
            })
          : await tx.subscription.create({
              data: {
                userId,
                subscriptionType: 'apple_iap',
                appleTransactionId: verifiedTransactionId,
                appleOriginalTransactionId: verifiedOriginalTransactionId,
                appleProductId: verifiedProductId,
                appleEnvironment: purchase.environment ?? verifiedEnv,
                status: statusFromPurchase ?? nextStatus,
                planId: verifiedProductId,
                planName: plan.planName,
                priceAmount: plan.priceAmount ?? 0,
                priceCurrency: plan.priceCurrency,
                billingPeriod: plan.billingPeriod,
                currentPeriodStart: purchase.purchaseDate,
                currentPeriodEnd: purchase.expiresDate || undefined,
                cancelAtPeriodEnd: false,
              },
            });

        try {
          await tx.subscriptionUser.create({
            data: {
              subscriptionId: subscription.id,
              userId,
              role: SubscriptionUserRole.OWNER,
            },
          });
        } catch (e: unknown) {
          if (
            !(
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'
            )
          )
            throw e;
        }

        return { subscription };
      });

      // Auto-create LINKED mappings for linked accounts (outside transaction)
      const linkedAccounts = await this.prisma.linkedAccount.findMany({
        where: { OR: [{ primaryUserId: userId }, { linkedUserId: userId }] },
      });
      for (const link of linkedAccounts) {
        const linkedUserId =
          link.primaryUserId === userId
            ? link.linkedUserId
            : link.primaryUserId;
        try {
          await this.prisma.subscriptionUser.create({
            data: {
              subscriptionId: result.subscription.id,
              userId: linkedUserId,
              role: SubscriptionUserRole.LINKED,
            },
          });
        } catch (e: unknown) {
          if (
            !(
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'
            )
          )
            throw e;
        }
      }

      if (
        result.subscription.status === SubscriptionStatus.ACTIVE ||
        result.subscription.status === SubscriptionStatus.TRIALING
      ) {
        await this.maybeGrantTrialAfterAppleIap(
          userId,
          deviceFingerprint,
          verifiedProductId,
        );
      }

      if (
        result.subscription.status === SubscriptionStatus.ACTIVE &&
        verifiedItem &&
        !this.isAppleTrialPeriodReceipt(verifiedItem)
      ) {
        try {
          await this.maybeNotifyApplePaidConversion(
            userId,
            verifiedOriginalTransactionId,
            verifiedProductId,
          );
        } catch (paidErr) {
          SafeLogger.warn(
            'Apple paid-conversion Slack skipped (non-fatal)',
            undefined,
            {
              userId,
              error:
                paidErr instanceof Error ? paidErr.message : String(paidErr),
            },
          );
        }
      }

      SafeLogger.info('Apple IAP purchase linked to user', {
        userId,
        transactionId: verifiedTransactionId,
      });

      return {
        success: true,
        message: 'Purchase linked successfully',
        subscription: {
          status: result.subscription.status,
          planName: this.resolvePlanMetadata(verifiedProductId).planName,
          currentPeriodEnd: result.subscription.currentPeriodEnd ?? null,
        },
      };
    } catch (error) {
      SafeLogger.error('Error linking Apple IAP purchase', error);
      throw error;
    }
  }

  async linkWithTransactionIds(
    userId: string,
    _sessionToken: string,
    transactionIds: Array<{
      transactionId: string;
      originalTransactionId: string;
      productId: string;
    }>,
    deviceFingerprint?: string,
    _devicePlatform?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ) {
    try {
      // Verify device fingerprint if provided
      if (deviceFingerprint) {
        SafeLogger.info('Bulk linking purchases with device verification', {
          userId,
          transactionCount: transactionIds.length,
          deviceFingerprint: deviceFingerprint.substring(0, 16) + '...',
        });
      }

      const linkedPurchases: Array<{
        transactionId: string;
        originalTransactionId: string;
        productId: string;
        status: string;
        subscriptionId: string;
      }> = [];
      const errors: Array<{
        transaction: {
          transactionId: string;
          originalTransactionId: string;
          productId: string;
        };
        error: string;
      }> = [];

      for (const txInfo of transactionIds) {
        try {
          // Validate transaction IDs
          if (
            !txInfo.transactionId ||
            !txInfo.originalTransactionId ||
            !txInfo.productId
          ) {
            errors.push({
              transaction: txInfo,
              error:
                'Missing required fields: transactionId, originalTransactionId, productId',
            });
            continue;
          }

          // Skip invalid transaction IDs (like "0" or empty strings)
          // Apple transaction IDs are typically very large numbers, so "0" indicates an invalid/uninitialized value
          // In development, we allow "0" for testing purposes
          const isProduction =
            (this.configService?.get<string>('NODE_ENV') ||
              process.env.NODE_ENV) === 'production';

          const isInvalidTransactionId =
            (txInfo.transactionId === '0' ||
              txInfo.transactionId.trim() === '' ||
              txInfo.originalTransactionId === '0' ||
              txInfo.originalTransactionId.trim() === '') &&
            isProduction; // Only reject "0" in production

          if (isInvalidTransactionId) {
            SafeLogger.warn('Invalid transaction ID detected - skipping', {
              transactionId: txInfo.transactionId,
              originalTransactionId: txInfo.originalTransactionId,
              productId: txInfo.productId,
              reason:
                'Transaction ID is "0" or empty, indicating purchase may not be completed yet',
            });
            errors.push({
              transaction: txInfo,
              error:
                'Invalid transaction ID. This usually means the purchase has not been completed yet or the transaction is still being processed by Apple.',
            });
            continue;
          }

          // In development, log but allow "0" transactions
          if (
            !isProduction &&
            (txInfo.transactionId === '0' ||
              txInfo.originalTransactionId === '0')
          ) {
            SafeLogger.info('Allowing transaction with ID "0" in development', {
              transactionId: txInfo.transactionId,
              originalTransactionId: txInfo.originalTransactionId,
              productId: txInfo.productId,
            });
          }

          // Find the captured purchase by originalTransactionId first (like vpn-backend-service)
          // Apple creates new transactionIds for renewals but keeps the same originalTransactionId
          let purchase = await this.prisma.appleIAPPurchase.findUnique({
            where: { originalTransactionId: txInfo.originalTransactionId },
          });

          // If not found by originalTransactionId, try transactionId
          if (!purchase) {
            purchase = await this.prisma.appleIAPPurchase.findUnique({
              where: { transactionId: txInfo.transactionId },
            });
          }

          // If still not found, do NOT auto-capture.
          // We never create ledger rows from unverified client transaction IDs.
          if (!purchase) {
            SafeLogger.warn('Purchase not found in ledger; cannot link', {
              transactionId: txInfo.transactionId,
              originalTransactionId: txInfo.originalTransactionId,
              productId: txInfo.productId,
            });
            errors.push({
              transaction: txInfo,
              error:
                'Purchase not found. Capture the purchase with a verified receipt before linking.',
            });
            continue;
          }

          // At this point, purchase should not be null, but TypeScript needs explicit check
          if (!purchase) {
            errors.push({
              transaction: txInfo,
              error: 'Could not find or capture purchase in ledger',
            });
            continue;
          }

          // Check if already linked to a different user
          if (purchase.linkedUserId && purchase.linkedUserId !== userId) {
            errors.push({
              transaction: txInfo,
              error: 'Already linked to another account',
            });
            continue;
          }

          // Check if already linked to this user
          if (purchase.linkedUserId === userId) {
            SafeLogger.info('Purchase already linked to this user', {
              transactionId: txInfo.transactionId,
              userId,
            });
          }

          const plan = this.resolvePlanMetadata(purchase.productId);
          const nextStatus = this.getExpectedSubscriptionStatus(
            purchase.expiresDate,
          );

          const { subscriptionId, status } = await this.prisma.$transaction(
            async (tx) => {
              const user = await tx.user.findUnique({ where: { id: userId } });
              if (!user) throw new Error('User not found');

              // Link purchase to user (update by originalTransactionId to handle renewals)
              await tx.appleIAPPurchase.update({
                where: {
                  originalTransactionId: purchase.originalTransactionId,
                },
                data: {
                  linkedUserId: userId,
                  linkedEmail: user.email,
                  linkedAt: new Date(),
                },
              });

              // Idempotent subscription upsert by lineage.
              const existingSubscription =
                (await tx.subscription.findFirst({
                  where: {
                    appleOriginalTransactionId: purchase.originalTransactionId,
                  },
                })) ??
                (await tx.subscription.findFirst({
                  where: { appleTransactionId: purchase.transactionId },
                }));

              const subscription = existingSubscription
                ? await tx.subscription.update({
                    where: { id: existingSubscription.id },
                    data: {
                      userId,
                      appleTransactionId: purchase.transactionId,
                      appleOriginalTransactionId:
                        purchase.originalTransactionId,
                      appleProductId: purchase.productId,
                      appleEnvironment: purchase.environment,
                      status: nextStatus,
                      planId: purchase.productId,
                      planName: plan.planName,
                      priceAmount:
                        plan.priceAmount ?? existingSubscription.priceAmount,
                      priceCurrency: plan.priceCurrency,
                      billingPeriod: plan.billingPeriod,
                      currentPeriodStart: purchase.purchaseDate,
                      currentPeriodEnd: purchase.expiresDate || undefined,
                      cancelAtPeriodEnd: false,
                    },
                  })
                : await tx.subscription.create({
                    data: {
                      userId,
                      subscriptionType: 'apple_iap',
                      appleTransactionId: purchase.transactionId,
                      appleOriginalTransactionId:
                        purchase.originalTransactionId,
                      appleProductId: purchase.productId,
                      appleEnvironment: purchase.environment,
                      status: nextStatus,
                      planId: purchase.productId,
                      planName: plan.planName,
                      priceAmount: plan.priceAmount ?? 0,
                      priceCurrency: plan.priceCurrency,
                      billingPeriod: plan.billingPeriod,
                      currentPeriodStart: purchase.purchaseDate,
                      currentPeriodEnd: purchase.expiresDate || undefined,
                      cancelAtPeriodEnd: false,
                    },
                  });

              try {
                await tx.subscriptionUser.create({
                  data: {
                    subscriptionId: subscription.id,
                    userId,
                    role: SubscriptionUserRole.OWNER,
                  },
                });
              } catch (e: unknown) {
                if (
                  !(
                    e instanceof Prisma.PrismaClientKnownRequestError &&
                    e.code === 'P2002'
                  )
                )
                  throw e;
              }

              return {
                subscriptionId: subscription.id,
                status: subscription.status,
              };
            },
          );

          // Auto-create LINKED mappings for linked accounts (outside transaction)
          const linkedAccounts = await this.prisma.linkedAccount.findMany({
            where: {
              OR: [{ primaryUserId: userId }, { linkedUserId: userId }],
            },
          });
          for (const link of linkedAccounts) {
            const linkedUserIdForMapping =
              link.primaryUserId === userId
                ? link.linkedUserId
                : link.primaryUserId;
            try {
              await this.prisma.subscriptionUser.create({
                data: {
                  subscriptionId,
                  userId: linkedUserIdForMapping,
                  role: SubscriptionUserRole.LINKED,
                },
              });
            } catch (e: unknown) {
              if (
                !(
                  e instanceof Prisma.PrismaClientKnownRequestError &&
                  e.code === 'P2002'
                )
              )
                throw e;
            }
          }

          if (
            status === SubscriptionStatus.ACTIVE ||
            status === SubscriptionStatus.TRIALING
          ) {
            await this.maybeGrantTrialAfterAppleIap(
              userId,
              deviceFingerprint,
              purchase.productId,
            );
          }

          if (status === SubscriptionStatus.ACTIVE) {
            const canNotifyPaid =
              await this.shouldNotifyPaidFromStoredAppleReceipt({
                receiptData: purchase.receiptData,
                originalTransactionId: purchase.originalTransactionId,
              });

            if (canNotifyPaid) {
              try {
                await this.maybeNotifyApplePaidConversion(
                  userId,
                  purchase.originalTransactionId,
                  purchase.productId,
                );
              } catch (paidErr) {
                SafeLogger.warn(
                  'Apple paid-conversion Slack skipped (non-fatal)',
                  undefined,
                  {
                    userId,
                    error:
                      paidErr instanceof Error
                        ? paidErr.message
                        : String(paidErr),
                  },
                );
              }
            }
          }

          linkedPurchases.push({
            transactionId: purchase.transactionId,
            originalTransactionId: purchase.originalTransactionId,
            productId: purchase.productId,
            status,
            subscriptionId,
          });
        } catch (error) {
          SafeLogger.error('Error processing transaction for linking', error, {
            transactionId: txInfo.transactionId,
            userId,
          });
          errors.push({
            transaction: txInfo,
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error during linking',
          });
        }
      }

      SafeLogger.info('Bulk Apple IAP linking completed', {
        userId,
        linkedCount: linkedPurchases.length,
        errorCount: errors.length,
        totalCount: transactionIds.length,
      });

      return {
        success: errors.length === 0,
        message:
          errors.length === 0
            ? 'All purchases linked successfully'
            : `${linkedPurchases.length} of ${transactionIds.length} purchases linked`,
        linkedCount: linkedPurchases.length,
        totalCount: transactionIds.length,
        linkedPurchases,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      SafeLogger.error(
        'Error linking Apple IAP purchases with transaction IDs',
        error,
      );
      throw error;
    }
  }
}
