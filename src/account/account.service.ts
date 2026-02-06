import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';

@Injectable()
export class AccountService {
  constructor(private prisma: PrismaService) {}

  async getProfileByFirebaseUid(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      include: {
        subscriptions: {
          where: {
            status: 'active',
            OR: [
              { currentPeriodEnd: null },
              { currentPeriodEnd: { gte: new Date() } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          where: {
            status: 'active',
            OR: [
              { currentPeriodEnd: null },
              { currentPeriodEnd: { gte: new Date() } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeSubscription = user.subscriptions[0] || null;

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        provider: user.provider,
      },
      subscription: activeSubscription
        ? {
            id: activeSubscription.id,
            status: activeSubscription.status,
            planName: activeSubscription.planName,
            currentPeriodEnd: activeSubscription.currentPeriodEnd,
            cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
            subscriptionType: activeSubscription.subscriptionType,
          }
        : null,
    };
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          select: { stripeCustomerId: true, stripeSubscriptionId: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Log deletion for audit
    SafeLogger.info('Account deletion initiated', {
      userId,
      email: '[REDACTED]',
      subscriptionCount: user.subscriptions.length,
    });

    // Cascade delete will handle subscriptions
    await this.prisma.user.delete({
      where: { id: userId },
    });

    // TODO: Trigger webhook to VPN service for data cleanup
    // TODO: Optionally delete Stripe customer data

    SafeLogger.info('Account deleted successfully', { userId });

    return {
      success: true,
      deletedUserId: userId,
      stripeCustomerIds: user.subscriptions
        .map((s) => s.stripeCustomerId)
        .filter((id): id is string => id !== null),
    };
  }

  async getPayments(userId: string) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const subscriptions = await this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      payments: subscriptions.map((sub) => ({
        id: sub.id,
        status: sub.status,
        planName: sub.planName,
        priceAmount: sub.priceAmount,
        priceCurrency: sub.priceCurrency,
        billingPeriod: sub.billingPeriod,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        subscriptionType: sub.subscriptionType,
        createdAt: sub.createdAt,
      })),
    };
  }

  async getInvoicePdf(userId: string, invoiceId: string) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Find subscription (invoice)
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: invoiceId },
    });

    if (!subscription) {
      throw new NotFoundException('Invoice not found');
    }

    // Verify subscription belongs to user
    if (subscription.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Generate PDF invoice
    // This is a simplified version - in production, use pdfkit or puppeteer
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {});

    doc.fontSize(20).text('Invoice', 100, 100);
    doc.fontSize(12).text(`Invoice ID: ${invoiceId}`, 100, 130);
    doc.text(`Plan: ${subscription.planName || 'N/A'}`, 100, 150);
    doc.text(
      `Amount: ${subscription.priceAmount || '0'} ${subscription.priceCurrency || 'USD'}`,
      100,
      170,
    );
    doc.text(
      `Period: ${subscription.currentPeriodStart?.toISOString() || 'N/A'} - ${subscription.currentPeriodEnd?.toISOString() || 'N/A'}`,
      100,
      190,
    );

    doc.end();

    // Wait for PDF to be generated
    return new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }
}
