import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getActiveSubscriptionForUser } from '../subscription/subscription-lookup.util';
import { SafeLogger } from '../common/utils/logger.util';
import PDFDocument from 'pdfkit';

@Injectable()
export class AccountService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async getProfileByFirebaseUid(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeSubscription = await getActiveSubscriptionForUser(
      this.prisma,
      user.id,
    );

    return {
      ...user,
      subscriptions: activeSubscription ? [activeSubscription] : [],
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeSubscription = await getActiveSubscriptionForUser(
      this.prisma,
      userId,
    );

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

    // Check if this user has linked accounts via subscription_users
    const linkedMappings = await this.prisma.subscriptionUser.findMany({
      where: { userId },
      include: { subscription: { select: { id: true, userId: true } } },
    });

    const isOwnerWithLinkedUsers = linkedMappings.some(
      (m) => m.subscription.userId === userId,
    );

    if (isOwnerWithLinkedUsers) {
      const affectedMappings = await this.prisma.subscriptionUser.findMany({
        where: {
          subscriptionId: { in: linkedMappings.map((m) => m.subscriptionId) },
          userId: { not: userId },
        },
        select: { userId: true },
      });

      SafeLogger.warn(
        'Deleting subscription owner with linked users — linked users will lose access',
        { service: 'AccountService', userId },
        { affectedUserIds: affectedMappings.map((m) => m.userId) },
      );
    }

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

  async getLinkedProviders(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Google users have firebaseUid and/or provider === 'google' but may not have googleUserId set
    const googleLinkedSelf =
      !!user.googleUserId || !!user.firebaseUid || user.provider === 'google';
    const appleLinkedSelf = !!user.appleUserId || user.provider === 'apple';

    const linkedAccounts = await this.prisma.linkedAccount.findMany({
      where: { OR: [{ primaryUserId: userId }, { linkedUserId: userId }] },
    });

    let googleLinkedOther = false;
    let appleLinkedOther = false;
    let googleEmail: string | undefined;
    let appleEmail: string | undefined;

    if (linkedAccounts.length > 0) {
      const linkedUserIds = linkedAccounts.map((la) =>
        la.primaryUserId === userId ? la.linkedUserId : la.primaryUserId,
      );
      const linkedUsers = await this.prisma.user.findMany({
        where: { id: { in: linkedUserIds } },
      });

      for (const linkedUser of linkedUsers) {
        if (
          linkedUser.googleUserId ||
          linkedUser.firebaseUid ||
          linkedUser.provider === 'google'
        ) {
          googleLinkedOther = true;
          googleEmail = googleEmail || linkedUser.email;
        }
        if (linkedUser.appleUserId) {
          appleLinkedOther = true;
          appleEmail = appleEmail || linkedUser.email;
        }
      }
    }

    return {
      success: true,
      providers: {
        google: {
          linked: googleLinkedSelf || googleLinkedOther,
          email: googleLinkedSelf ? user.email : googleEmail,
        },
        apple: {
          linked: appleLinkedSelf || appleLinkedOther,
          email: appleLinkedSelf ? user.email : appleEmail,
        },
      },
    };
  }

  async getPayments(userId: string): Promise<{ payments: any[] }> {
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
    let hasAccess = subscription.userId === userId;
    if (!hasAccess) {
      const mapping = await this.prisma.subscriptionUser.findFirst({
        where: { subscriptionId: subscription.id, userId },
      });
      hasAccess = mapping !== null;
    }
    if (!hasAccess) {
      throw new ForbiddenException('Access denied');
    }

    // Generate PDF invoice
    // This is a simplified version - in production, use pdfkit or puppeteer
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {});

    doc.fontSize(20).text('Invoice', 100, 100);
    doc.fontSize(12).text(`Invoice ID: ${invoiceId}`, 100, 130);
    doc.text(`Plan: ${subscription.planName || 'N/A'}`, 100, 150);
    doc.text(
      `Amount: ${subscription.priceAmount?.toString() || '0'} ${subscription.priceCurrency || 'USD'}`,
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
