import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseConfig } from '../config/firebase.config';
import { AppleTokenVerifierService } from './apple-token-verifier.service';
import { SubscriptionStatus } from '@prisma/client';
import { SafeLogger } from '../common/utils/logger.util';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

type Provider = 'google' | 'apple';

interface SecondaryUserInfo {
  id: string;
  email: string;
  provider: string;
  hasActiveSubscription: boolean;
}

export interface CheckLinkResult {
  action: 'already_linked' | 'fresh_link' | 'merge_required' | 'blocked';
  secondaryUser?: SecondaryUserInfo;
  reason?: string;
}

export interface ConfirmLinkResult {
  success: boolean;
  action: 'linked' | 'merged';
  linkedProviders: string[];
  newSessionToken?: string;
}

interface VerifiedIdentity {
  providerUserId: string;
  email?: string;
}

@Injectable()
export class LinkProviderService {
  constructor(
    @Inject(FirebaseConfig) private firebaseConfig: FirebaseConfig,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(AppleTokenVerifierService)
    private appleTokenVerifier: AppleTokenVerifierService,
  ) {}

  /**
   * Read-only check: determines what would happen if the user links this provider.
   */
  async checkLinkProvider(
    currentUserId: string,
    provider: Provider,
    idToken: string,
  ): Promise<CheckLinkResult> {
    const identity = await this.verifyToken(provider, idToken);

    // Get current user from DB
    const currentUser = await this.prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!currentUser) {
      throw new UnauthorizedException('Current user not found');
    }

    // Check if identity is already on current user
    if (this.isAlreadyLinked(currentUser, provider, identity.providerUserId)) {
      return { action: 'already_linked' };
    }

    // Look up other user by provider field
    const otherUser = await this.findUserByProviderIdentity(
      provider,
      identity.providerUserId,
    );

    if (!otherUser) {
      return { action: 'fresh_link' };
    }

    // Other user exists — check active subscriptions on both
    const [currentUserActiveSub, otherUserActiveSub] = await Promise.all([
      this.findActiveSubscription(currentUser.id),
      this.findActiveSubscription(otherUser.id),
    ]);

    if (currentUserActiveSub && otherUserActiveSub) {
      return {
        action: 'blocked',
        reason: 'dual_active_subscriptions',
      };
    }

    return {
      action: 'merge_required',
      secondaryUser: {
        id: otherUser.id,
        email: otherUser.email,
        provider: otherUser.provider,
        hasActiveSubscription: !!otherUserActiveSub,
      },
    };
  }

  /**
   * Executes the link or merge operation.
   */
  async confirmLinkProvider(
    currentUserId: string,
    provider: Provider,
    idToken: string,
  ): Promise<ConfirmLinkResult> {
    // Re-run all validations from check
    const identity = await this.verifyToken(provider, idToken);

    const currentUser = await this.prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!currentUser) {
      throw new UnauthorizedException('Current user not found');
    }

    if (this.isAlreadyLinked(currentUser, provider, identity.providerUserId)) {
      throw new BadRequestException(
        'Provider is already linked to this account',
      );
    }

    const otherUser = await this.findUserByProviderIdentity(
      provider,
      identity.providerUserId,
    );

    // --- Fresh link (no other user owns this identity) ---
    if (!otherUser) {
      const updateData = this.buildProviderUpdateData(
        provider,
        identity.providerUserId,
      );

      const updatedUser = await this.prisma.user.update({
        where: { id: currentUser.id },
        data: {
          ...updateData,
          provider: 'google+apple',
        },
      });

      SafeLogger.info('Provider linked successfully (fresh link)', {
        service: 'LinkProviderService',
        userId: currentUser.id,
      });

      return {
        success: true,
        action: 'linked',
        linkedProviders: this.getLinkedProviders(updatedUser),
      };
    }

    // --- Merge required ---
    const [currentUserActiveSub, otherUserActiveSub] = await Promise.all([
      this.findActiveSubscription(currentUser.id),
      this.findActiveSubscription(otherUser.id),
    ]);

    if (currentUserActiveSub && otherUserActiveSub) {
      throw new ConflictException(
        'Cannot merge: both accounts have active subscriptions',
      );
    }

    // Determine primary (user with active sub, or current user if neither)
    let primaryUser: typeof currentUser;
    let secondaryUser: typeof currentUser;

    if (otherUserActiveSub && !currentUserActiveSub) {
      primaryUser = otherUser;
      secondaryUser = currentUser;
    } else {
      primaryUser = currentUser;
      secondaryUser = otherUser;
    }

    await this.prisma.$transaction(async (tx) => {
      // Copy provider fields from secondary to primary
      const providerFieldsUpdate: Record<string, any> = {
        provider: 'google+apple',
      };

      if (!primaryUser.firebaseUid && secondaryUser.firebaseUid) {
        providerFieldsUpdate.firebaseUid = secondaryUser.firebaseUid;
      }
      if (!primaryUser.appleUserId && secondaryUser.appleUserId) {
        providerFieldsUpdate.appleUserId = secondaryUser.appleUserId;
      }
      if (!primaryUser.googleUserId && secondaryUser.googleUserId) {
        providerFieldsUpdate.googleUserId = secondaryUser.googleUserId;
      }
      if (!primaryUser.stripeCustomerId && secondaryUser.stripeCustomerId) {
        providerFieldsUpdate.stripeCustomerId = secondaryUser.stripeCustomerId;
      }

      // Inherit trial fields if primary has none and secondary does
      if (!primaryUser.trialActive && secondaryUser.trialActive) {
        providerFieldsUpdate.trialActive = secondaryUser.trialActive;
        providerFieldsUpdate.trialStartsAt = secondaryUser.trialStartsAt;
        providerFieldsUpdate.trialEndsAt = secondaryUser.trialEndsAt;
        providerFieldsUpdate.trialTier = secondaryUser.trialTier;
      }

      await tx.user.update({
        where: { id: primaryUser.id },
        data: providerFieldsUpdate,
      });

      // Re-point FKs from secondary to primary
      await tx.subscription.updateMany({
        where: { userId: secondaryUser.id },
        data: { userId: primaryUser.id },
      });

      await tx.appleIAPPurchase.updateMany({
        where: { linkedUserId: secondaryUser.id },
        data: { linkedUserId: primaryUser.id },
      });

      await tx.pushToken.updateMany({
        where: { userId: secondaryUser.id },
        data: { userId: primaryUser.id },
      });

      await tx.deviceTrialFingerprint.updateMany({
        where: { userId: secondaryUser.id },
        data: { userId: primaryUser.id },
      });

      // Delete secondary's trialGrant
      await tx.trialGrant.deleteMany({
        where: { userId: secondaryUser.id },
      });

      // Create subscriptionUser entries for all subscriptions under primary
      const allSubscriptions = await tx.subscription.findMany({
        where: { userId: primaryUser.id },
        select: { id: true },
      });

      for (const sub of allSubscriptions) {
        // Use upsert to avoid unique constraint violations
        await tx.subscriptionUser.upsert({
          where: {
            subscriptionId_userId: {
              subscriptionId: sub.id,
              userId: primaryUser.id,
            },
          },
          create: {
            subscriptionId: sub.id,
            userId: primaryUser.id,
          },
          update: {},
        });
      }

      // Archive secondary: set mergedIntoUserId, mutate email, null out unique fields
      await tx.user.update({
        where: { id: secondaryUser.id },
        data: {
          mergedIntoUserId: primaryUser.id,
          email: `${secondaryUser.email}_merged_${randomUUID()}`,
          firebaseUid: null,
          appleUserId: null,
          googleUserId: null,
          stripeCustomerId: null,
        },
      });
    });

    SafeLogger.info('Accounts merged successfully', {
      service: 'LinkProviderService',
      userId: primaryUser.id,
    });

    // If primary !== current user, generate new session token
    let newSessionToken: string | undefined;
    if (primaryUser.id !== currentUserId) {
      newSessionToken = this.generateSessionToken(primaryUser.id);
    }

    // Re-fetch primary user to get updated state
    const updatedPrimaryUser = await this.prisma.user.findUnique({
      where: { id: primaryUser.id },
    });

    return {
      success: true,
      action: 'merged',
      linkedProviders: this.getLinkedProviders(updatedPrimaryUser!),
      ...(newSessionToken && { newSessionToken }),
    };
  }

  // --- Private helpers ---

  private async verifyToken(
    provider: Provider,
    idToken: string,
  ): Promise<VerifiedIdentity> {
    try {
      if (provider === 'google') {
        const decoded = await this.firebaseConfig
          .getAuth()
          .verifyIdToken(idToken);
        return {
          providerUserId: decoded.uid,
          email: decoded.email,
        };
      } else {
        const decoded =
          await this.appleTokenVerifier.verifyIdentityToken(idToken);
        return {
          providerUserId: decoded.sub,
          email: decoded.email,
        };
      }
    } catch (error) {
      SafeLogger.error('Token verification failed during link', error, {
        service: 'LinkProviderService',
      });
      throw new UnauthorizedException('Invalid identity token');
    }
  }

  private isAlreadyLinked(
    user: { firebaseUid: string | null; appleUserId: string | null },
    provider: Provider,
    providerUserId: string,
  ): boolean {
    if (provider === 'google') {
      return user.firebaseUid === providerUserId;
    }
    return user.appleUserId === providerUserId;
  }

  private async findUserByProviderIdentity(
    provider: Provider,
    providerUserId: string,
  ) {
    if (provider === 'google') {
      return this.prisma.user.findUnique({
        where: { firebaseUid: providerUserId },
      });
    }
    return this.prisma.user.findUnique({
      where: { appleUserId: providerUserId },
    });
  }

  private async findActiveSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
        OR: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { gte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildProviderUpdateData(
    provider: Provider,
    providerUserId: string,
  ): Record<string, string> {
    if (provider === 'google') {
      return { firebaseUid: providerUserId };
    }
    return { appleUserId: providerUserId };
  }

  private getLinkedProviders(user: {
    firebaseUid: string | null;
    appleUserId: string | null;
  }): string[] {
    const providers: string[] = [];
    if (user.firebaseUid) providers.push('google');
    if (user.appleUserId) providers.push('apple');
    return providers;
  }

  private generateSessionToken(userId: string): string {
    const secret =
      this.configService?.get<string>('JWT_SECRET') ||
      process.env.JWT_SECRET ||
      'default-secret-change-in-production';

    return jwt.sign({ userId, type: 'session' }, secret, { expiresIn: '90d' });
  }
}
