import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SafeLogger } from '../../common/utils/logger.util';

const APPLE_RECEIPT_URLS = {
  sandbox: 'https://sandbox.itunes.apple.com/verifyReceipt',
  production: 'https://buy.itunes.apple.com/verifyReceipt',
};

@Injectable()
export class AppleService {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async verifyReceipt(receiptData: string) {
    const sharedSecret = this.configService.get<string>('APPLE_SHARED_SECRET');

    try {
      // Try production first
      let response = await fetch(APPLE_RECEIPT_URLS.production, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receiptData,
          password: sharedSecret || '',
          'exclude-old-transactions': true,
        }),
      });

      let result = await response.json();

      // If production returns sandbox error, try sandbox
      if (result.status === 21007) {
        SafeLogger.info('Production receipt failed, trying sandbox');
        response = await fetch(APPLE_RECEIPT_URLS.sandbox, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            'receipt-data': receiptData,
            password: sharedSecret || '',
            'exclude-old-transactions': true,
          }),
        });
        result = await response.json();
      }

      return result;
    } catch (error) {
      SafeLogger.error('Error verifying Apple receipt', error);
      throw error;
    }
  }

  async handleWebhookEvent(event: any) {
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

  private async handleRefund(event: any) {
    // Handle refund - mark subscription as cancelled
    const unifiedReceipt = event.unified_receipt;
    if (unifiedReceipt?.latest_receipt_info) {
      const latestReceipt = unifiedReceipt.latest_receipt_info[0];
      const originalTransactionId = latestReceipt.original_transaction_id;

      const subscription = await this.prisma.subscription.findFirst({
        where: { appleOriginalTransactionId: originalTransactionId },
      });

      if (subscription) {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
          },
        });
      }
    }
  }

  private async handleRenewal(event: any) {
    // Handle subscription renewal
    const unifiedReceipt = event.unified_receipt;
    if (unifiedReceipt?.latest_receipt_info) {
      const latestReceipt = unifiedReceipt.latest_receipt_info[0];
      await this.processAppleReceipt(latestReceipt, unifiedReceipt.environment);
    }
  }

  private async handleRenewalStatusChange(event: any) {
    // Handle auto-renewal status change
    const unifiedReceipt = event.unified_receipt;
    if (unifiedReceipt?.latest_receipt_info) {
      const latestReceipt = unifiedReceipt.latest_receipt_info[0];
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

  private async processAppleReceipt(receipt: any, environment: string) {
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

    // Check if subscription exists
    const existing = await this.prisma.subscription.findFirst({
      where: { appleTransactionId: transactionId },
    });

    if (!existing) {
      await this.prisma.subscription.create({
        data: {
          userId,
          subscriptionType: 'apple_iap',
          appleTransactionId: transactionId,
          appleOriginalTransactionId: originalTransactionId,
          appleProductId: productId,
          appleEnvironment: environment,
          status:
            expiresDate && expiresDate > new Date() ? 'active' : 'inactive',
          planId: productId,
          planName: this.getPlanName(productId),
          priceAmount: this.getPlanPrice(productId),
          priceCurrency: 'USD',
          billingPeriod: 'year',
          currentPeriodStart: purchaseDate,
          currentPeriodEnd: expiresDate || undefined,
          cancelAtPeriodEnd: false,
        },
      });
    }
  }

  private getPlanName(productId: string): string {
    if (productId.includes('annual')) {
      return 'Premium VPN - Annual';
    }
    return 'Premium VPN';
  }

  private getPlanPrice(productId: string): number {
    if (productId.includes('annual')) {
      return 130.99;
    }
    return 0;
  }
}

