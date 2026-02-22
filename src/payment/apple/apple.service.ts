/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SafeLogger } from '../../common/utils/logger.util';
import { TrialService } from '../../subscription/trial.service';

const APPLE_RECEIPT_URLS = {
  sandbox: 'https://sandbox.itunes.apple.com/verifyReceipt',
  production: 'https://buy.itunes.apple.com/verifyReceipt',
};

@Injectable()
export class AppleService {
  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => TrialService))
    private trialService: TrialService,
  ) {}

  async verifyReceipt(receiptData: string) {
    const sharedSecret =
      this.configService?.get<string>('APPLE_SHARED_SECRET') ||
      process.env.APPLE_SHARED_SECRET;

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

      // Grant trial if eligible (after subscription is created)
      try {
        const fullUser = await this.prisma.user.findUnique({
          where: { id: userId },
        });
        if (fullUser) {
          const trialResult = await this.trialService.grantIfEligible(
            fullUser,
            null,
          );
          if (trialResult.granted) {
            SafeLogger.info('Trial granted on subscription', {
              userId: trialResult.userId,
              trialEndsAt: trialResult.trialEndsAt?.toISOString(),
            });
          }
        }
      } catch (trialError) {
        // Don't fail subscription creation if trial grant fails
        SafeLogger.warn(
          'Failed to grant trial on subscription (non-fatal)',
          trialError,
        );
      }
    } else {
      // Update existing subscription
      if (
        existing.status !==
          (expiresDate && expiresDate > new Date() ? 'active' : 'inactive') ||
        (expiresDate &&
          existing.currentPeriodEnd?.getTime() !== expiresDate.getTime())
      ) {
        await this.prisma.subscription.update({
          where: { id: existing.id },
          data: {
            status:
              expiresDate && expiresDate > new Date() ? 'active' : 'inactive',
            currentPeriodEnd: expiresDate || undefined,
          },
        });
        SafeLogger.info('Subscription updated from Apple receipt', {
          subscriptionId: existing.id,
          appleTransactionId: transactionId,
        });
      }
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

  async capturePurchase(
    transactionId: string,
    originalTransactionId: string,
    productId: string,
    purchaseDateMs: string,
    expiresDateMs: string | undefined,
    receiptData: string | undefined,
    environment: string | undefined,
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

      // Verify receipt if provided
      if (receiptData) {
        const receiptResponse = await this.verifyReceipt(receiptData);
        if (receiptResponse.status !== 0) {
          SafeLogger.warn('Invalid receipt data provided to capturePurchase', {
            status: receiptResponse.status,
            transactionId,
          });
          throw new Error('Invalid receipt data');
        }
      }

      const purchaseDate = new Date(parseInt(purchaseDateMs));
      const expiresDate = expiresDateMs
        ? new Date(parseInt(expiresDateMs))
        : null;

      // Check if purchase already exists
      const existing = await this.prisma.appleIAPPurchase.findUnique({
        where: { transactionId },
      });

      if (existing) {
        // Update existing purchase
        await this.prisma.appleIAPPurchase.update({
          where: { transactionId },
          data: {
            expiresDate,
            receiptData: receiptData || existing.receiptData,
            environment: environment || existing.environment,
          },
        });

        SafeLogger.info('Apple IAP purchase updated', {
          transactionId,
        });

        return { success: true, message: 'Purchase updated' };
      }

      // Create new purchase record
      await this.prisma.appleIAPPurchase.create({
        data: {
          transactionId,
          originalTransactionId,
          productId,
          environment: environment || 'Production',
          purchaseDate,
          expiresDate,
          receiptData: receiptData || null,
        },
      });

      SafeLogger.info('Apple IAP purchase captured', {
        transactionId,
        productId,
      });

      return { success: true, message: 'Purchase captured successfully' };
    } catch (error) {
      SafeLogger.error('Error capturing Apple IAP purchase', error);
      throw error;
    }
  }

  async linkPurchase(
    userId: string,
    sessionToken: string,
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

      // Find the captured purchase
      const purchase = await this.prisma.appleIAPPurchase.findUnique({
        where: { transactionId },
        include: { linkedUser: true },
      });

      if (!purchase) {
        throw new Error(
          'Purchase not found. Please complete the purchase first.',
        );
      }

      // Check if already linked to a different user
      if (purchase.linkedUserId && purchase.linkedUserId !== userId) {
        throw new Error(
          'This purchase is already linked to another account. Each purchase can only be linked to one account.',
        );
      }

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Link purchase to user
      await this.prisma.appleIAPPurchase.update({
        where: { transactionId },
        data: {
          linkedUserId: userId,
          linkedEmail: user.email,
          linkedAt: new Date(),
        },
      });

      // Create or update subscription
      const purchaseDate = purchase.purchaseDate;
      const expiresDate = purchase.expiresDate;
      const isActive = expiresDate ? expiresDate > new Date() : false;

      const existingSubscription = await this.prisma.subscription.findFirst({
        where: { appleTransactionId: transactionId },
      });

      if (!existingSubscription) {
        await this.prisma.subscription.create({
          data: {
            userId,
            subscriptionType: 'apple_iap',
            appleTransactionId: transactionId,
            appleOriginalTransactionId: originalTransactionId,
            appleProductId: productId,
            appleEnvironment: purchase.environment,
            status: isActive ? 'active' : 'inactive',
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

        // Grant trial if eligible (after subscription is created)
        try {
          const fullUser = await this.prisma.user.findUnique({
            where: { id: userId },
          });
          if (fullUser) {
            const trialResult = await this.trialService.grantIfEligible(
              fullUser,
              null,
            );
            if (trialResult.granted) {
              SafeLogger.info('Trial granted on subscription', {
                userId: trialResult.userId,
                trialEndsAt: trialResult.trialEndsAt?.toISOString(),
              });
            }
          }
        } catch (trialError) {
          // Don't fail subscription creation if trial grant fails
          SafeLogger.warn(
            'Failed to grant trial on subscription (non-fatal)',
            trialError,
          );
        }
      } else {
        // Update existing subscription if status changed
        if (
          existingSubscription.status !== (isActive ? 'active' : 'inactive')
        ) {
          await this.prisma.subscription.update({
            where: { id: existingSubscription.id },
            data: {
              status: isActive ? 'active' : 'inactive',
              currentPeriodEnd: expiresDate || undefined,
            },
          });
          SafeLogger.info('Subscription status updated for linked purchase', {
            subscriptionId: existingSubscription.id,
            transactionId,
            newStatus: isActive ? 'active' : 'inactive',
          });
        }
      }

      SafeLogger.info('Apple IAP purchase linked to user', {
        userId,
        transactionId,
      });

      return {
        success: true,
        message: 'Purchase linked successfully',
        subscription: {
          status: isActive ? 'active' : 'inactive',
          planName: this.getPlanName(productId),
          currentPeriodEnd: expiresDate,
        },
      };
    } catch (error) {
      SafeLogger.error('Error linking Apple IAP purchase', error);
      throw error;
    }
  }

  async linkWithTransactionIds(
    userId: string,
    sessionToken: string,
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

          // If still not found, auto-capture the purchase (like vpn-backend-service)
          if (!purchase) {
            SafeLogger.info('Purchase not found in ledger, auto-capturing', {
              transactionId: txInfo.transactionId,
              originalTransactionId: txInfo.originalTransactionId,
              productId: txInfo.productId,
            });

            try {
              // Auto-capture the purchase
              purchase = await this.prisma.appleIAPPurchase.create({
                data: {
                  transactionId: txInfo.transactionId,
                  originalTransactionId: txInfo.originalTransactionId,
                  productId: txInfo.productId,
                  purchaseDate: new Date(), // Use current date as fallback
                  expiresDate: null, // Will be updated when receipt is verified
                  environment: null,
                  receiptData: null,
                },
              });
              SafeLogger.info('Purchase auto-captured successfully', {
                transactionId: txInfo.transactionId,
                originalTransactionId: txInfo.originalTransactionId,
              });
            } catch (captureError) {
              SafeLogger.error(
                'Failed to auto-capture purchase',
                captureError,
                {
                  transactionId: txInfo.transactionId,
                  originalTransactionId: txInfo.originalTransactionId,
                },
              );
              errors.push({
                transaction: txInfo,
                error: `Failed to capture purchase: ${captureError instanceof Error ? captureError.message : 'Unknown error'}`,
              });
              continue;
            }
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

          // Link purchase to user (update by originalTransactionId to handle renewals)
          await this.prisma.appleIAPPurchase.update({
            where: { originalTransactionId: txInfo.originalTransactionId },
            data: {
              linkedUserId: userId,
              linkedEmail:
                (await this.prisma.user.findUnique({ where: { id: userId } }))
                  ?.email || null,
              linkedAt: new Date(),
            },
          });

          // Create or update subscription
          const isActive = purchase.expiresDate
            ? purchase.expiresDate > new Date()
            : false;

          // Check for existing subscription by transactionId first
          let existingSubscription = await this.prisma.subscription.findFirst({
            where: { appleTransactionId: txInfo.transactionId },
          });

          // If not found, check by originalTransactionId (for renewals)
          if (!existingSubscription) {
            existingSubscription = await this.prisma.subscription.findFirst({
              where: {
                appleOriginalTransactionId: txInfo.originalTransactionId,
              },
            });
          }

          let subscriptionId: string;
          if (!existingSubscription) {
            const newSubscription = await this.prisma.subscription.create({
              data: {
                userId,
                subscriptionType: 'apple_iap',
                appleTransactionId: txInfo.transactionId,
                appleOriginalTransactionId: txInfo.originalTransactionId,
                appleProductId: txInfo.productId,
                appleEnvironment: purchase.environment,
                status: isActive ? 'active' : 'inactive',
                planId: txInfo.productId,
                planName: this.getPlanName(txInfo.productId),
                priceAmount: this.getPlanPrice(txInfo.productId),
                priceCurrency: 'USD',
                billingPeriod: 'year',
                currentPeriodStart: purchase.purchaseDate,
                currentPeriodEnd: purchase.expiresDate || undefined,
                cancelAtPeriodEnd: false,
              },
            });
            subscriptionId = newSubscription.id;
            SafeLogger.info('Subscription created for linked purchase', {
              subscriptionId,
              transactionId: txInfo.transactionId,
              userId,
              status: isActive ? 'active' : 'inactive',
            });

            // Grant trial if eligible (after subscription is created)
            try {
              const fullUser = await this.prisma.user.findUnique({
                where: { id: userId },
              });
              if (fullUser) {
                const trialResult = await this.trialService.grantIfEligible(
                  fullUser,
                  null,
                );
                if (trialResult.granted) {
                  SafeLogger.info('Trial granted on subscription', {
                    userId: trialResult.userId,
                    trialEndsAt: trialResult.trialEndsAt?.toISOString(),
                  });
                }
              }
            } catch (trialError) {
              // Don't fail subscription creation if trial grant fails
              SafeLogger.warn(
                'Failed to grant trial on subscription (non-fatal)',
                trialError,
              );
            }
          } else {
            subscriptionId = existingSubscription.id;
            // Update subscription status if needed
            if (
              existingSubscription.status !== (isActive ? 'active' : 'inactive')
            ) {
              await this.prisma.subscription.update({
                where: { id: existingSubscription.id },
                data: {
                  status: isActive ? 'active' : 'inactive',
                  currentPeriodEnd: purchase.expiresDate || undefined,
                },
              });
              SafeLogger.info('Subscription status updated', {
                subscriptionId,
                transactionId: txInfo.transactionId,
                newStatus: isActive ? 'active' : 'inactive',
              });
            }
          }

          linkedPurchases.push({
            transactionId: txInfo.transactionId,
            originalTransactionId: txInfo.originalTransactionId,
            productId: txInfo.productId,
            status: isActive ? 'active' : 'inactive',
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
