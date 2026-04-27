import {
  Injectable,
  UnauthorizedException,
  Inject,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseConfig } from '../config/firebase.config';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubscriptionStatus,
  Prisma,
  SubscriptionUserRole,
} from '@prisma/client';
import { getActiveSubscriptionForUser } from '../subscription/subscription-lookup.util';
import { SafeLogger } from '../common/utils/logger.util';
import { AppleTokenVerifierService } from './apple-token-verifier.service';
import { EmailService } from '../email/email.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(
    @Inject(FirebaseConfig) private firebaseConfig: FirebaseConfig,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(AppleTokenVerifierService)
    private appleTokenVerifier: AppleTokenVerifierService,
    @Inject(EmailService)
    private readonly emailService: EmailService,
  ) {}

  private normalizeProvider(
    provider?: string | null,
    fallback: 'google' | 'apple' = 'google',
  ): 'google' | 'apple' {
    const value = (provider || '').toLowerCase();
    if (value === 'apple' || value === 'apple.com') return 'apple';
    if (value === 'google' || value === 'google.com') return 'google';
    return fallback;
  }

  async login(idToken: string, providerOverride?: 'google' | 'apple') {
    try {
      // Verify Firebase ID token
      const decodedToken = await this.firebaseConfig
        .getAuth()
        .verifyIdToken(idToken);

      const firebaseUid = decodedToken.uid;
      const email = decodedToken.email;
      const displayName = (decodedToken.name as string) || '';
      const emailVerified = decodedToken.email_verified || false;

      // Extract Apple user ID from Firebase token identities (for linked account lookup)
      const firebaseClaim = decodedToken.firebase as
        | { identities?: Record<string, string[]>; sign_in_provider?: string }
        | undefined;
      const appleUserIdFromToken =
        firebaseClaim?.identities?.['apple.com']?.[0];

      // Determine provider: use override if given, otherwise infer from the
      // Firebase token. If sign_in_provider is absent/unrecognised, use Apple
      // identities in the token as a hint so Apple users don't get mislabelled.
      const providerFallback = appleUserIdFromToken ? 'apple' : 'google';
      const provider = providerOverride
        ? this.normalizeProvider(providerOverride)
        : this.normalizeProvider(
            decodedToken.firebase?.sign_in_provider,
            providerFallback,
          );

      if (!email) {
        throw new UnauthorizedException('Email not found in token');
      }

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { firebaseUid },
      });

      if (!user) {
        user = await this.prisma.user.findUnique({
          where: { email },
        });
      }

      // For Apple sign-in via Firebase: also check by appleUserId
      if (!user && appleUserIdFromToken) {
        user = await this.prisma.user.findUnique({
          where: { appleUserId: appleUserIdFromToken },
        });
      }

      let createdUser = false;
      if (!user) {
        // No existing user found — create new
        user = await this.prisma.user.create({
          data: {
            firebaseUid,
            email,
            displayName,
            provider,
            emailVerified,
          },
        });
        createdUser = true;
      } else {
        // Block sign-in if the token provider doesn't match the registered provider.
        // This catches cases where Firebase auto-merged accounts (same email) but
        // the user registered with a different provider on our platform.
        // Linked accounts are separate user records — each signs in with their own
        // provider, so there's never a legitimate mismatch here.
        if (user.provider !== provider) {
          const registeredWith = user.provider === 'apple' ? 'Apple' : 'Google';
          throw new ConflictException(
            `This email is registered with ${registeredWith}. Please sign in with ${registeredWith} instead.`,
          );
        }

        // Update user info — but preserve email if this Apple account has a linked
        // Google identity (prevents Apple relay email from overwriting canonical email).
        const isAppleLogin = provider === 'apple';
        const hasGoogleLinked = !!user.googleUserId;
        const shouldPreserveEmail = isAppleLogin && hasGoogleLinked;

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            ...(shouldPreserveEmail ? {} : { email }),
            // Set firebaseUid if missing (e.g. secondary user created during linking)
            ...(!user.firebaseUid ? { firebaseUid } : {}),
            displayName: displayName || user.displayName,
            emailVerified,
          },
        });
      }

      // Get user ID for subscription lookup
      const userId = user.id;

      // Get active subscription
      const activeSubscription = await getActiveSubscriptionForUser(
        this.prisma,
        userId,
      );

      SafeLogger.info(
        'User logged in successfully',
        { service: 'AuthService', userId },
        { hasActiveSubscription: !!activeSubscription },
      );

      if (createdUser) {
        void this.sendWelcomeEmailNonFatal({
          email: user.email,
          displayName: user.displayName,
        });
      }

      const sessionToken = this.generateSessionToken(user.id);
      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          provider: user.provider,
        },
        sessionToken,
        subscription: activeSubscription
          ? {
              id: activeSubscription.id,
              status: activeSubscription.status,
              planName: activeSubscription.planName,
              plan: this.resolveSubscriptionPlan(activeSubscription),
              currentPeriodEnd: activeSubscription.currentPeriodEnd,
              cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
              subscriptionType: activeSubscription.subscriptionType,
            }
          : null,
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      SafeLogger.error('Login failed', error, { service: 'AuthService' });
      throw new UnauthorizedException('Invalid token');
    }
  }

  async logout(userId: string) {
    // Server-side cleanup if needed
    // For Firebase, tokens are stateless, so we just log the logout
    SafeLogger.info('User logged out', { service: 'AuthService', userId });
    return Promise.resolve({ success: true });
  }

  private generateSessionToken(userId: string): string {
    const secret =
      this.configService?.get<string>('JWT_SECRET') ||
      process.env.JWT_SECRET ||
      'default-secret-change-in-production';

    return jwt.sign(
      { userId, type: 'session' },
      secret,
      { expiresIn: '90d' }, // 90 days session
    );
  }

  async googleSignIn(idToken: string) {
    try {
      // Verify Firebase ID token
      const decodedToken = await this.firebaseConfig
        .getAuth()
        .verifyIdToken(idToken);

      const firebaseUid = decodedToken.uid;
      const email = decodedToken.email;
      const displayName = (decodedToken.name as string) || '';
      const emailVerified = decodedToken.email_verified || false;
      const provider = 'google';

      if (!email) {
        throw new UnauthorizedException('Email not found in token');
      }

      // Extract Apple user ID from Firebase token identities (for linked account lookup)
      const firebaseClaimG = decodedToken.firebase as
        | { identities?: Record<string, string[]> }
        | undefined;
      const appleUserIdFromTokenG =
        firebaseClaimG?.identities?.['apple.com']?.[0];

      // Find or create user — check firebaseUid, then email, then appleUserId (for linked accounts)
      let user = await this.prisma.user.findUnique({
        where: { firebaseUid },
      });

      if (!user) {
        user = await this.prisma.user.findUnique({
          where: { email },
        });
      }

      // Fallback: check by appleUserId from token identities
      // This finds linked accounts when onAuthStateChanged calls googleSignIn for an Apple user
      if (!user && appleUserIdFromTokenG) {
        user = await this.prisma.user.findUnique({
          where: { appleUserId: appleUserIdFromTokenG },
        });
      }

      let createdUser = false;
      if (!user) {
        // Create new user
        user = await this.prisma.user.create({
          data: {
            firebaseUid,
            email,
            displayName,
            provider,
            emailVerified,
          },
        });
        createdUser = true;
      } else {
        // Block sign-in if this account is registered with a different provider
        if (user.provider === 'apple') {
          throw new ConflictException(
            'This email is registered with Apple Sign-In. Please sign in with Apple instead.',
          );
        }

        // Update user info — but preserve email if user has a linked account
        const hasLinkedApple = !!user.appleUserId;
        const isAppleToken = !!appleUserIdFromTokenG;
        const shouldPreserveEmail =
          isAppleToken && hasLinkedApple && user.email !== email;

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            ...(shouldPreserveEmail ? {} : { email }),
            displayName: displayName || user.displayName,
            emailVerified,
          },
        });
      }

      // Use shared lookup that includes SubscriptionUser fallback for linked accounts
      const activeSubscription = await getActiveSubscriptionForUser(
        this.prisma,
        user.id,
      );

      let subscriptionForResponse =
        activeSubscription ??
        (await this.prisma.subscription.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
        }));

      // Fallback for Apple users whose Apple purchase exists but has not yet
      // been materialized into the subscriptions table.
      if (!subscriptionForResponse) {
        const activeApplePurchase =
          await this.prisma.appleIAPPurchase.findFirst({
            where: {
              OR: [{ linkedUserId: user.id }, { linkedEmail: user.email }],
              expiresDate: { gte: new Date() },
            },
            orderBy: { expiresDate: 'desc' },
          });

        if (activeApplePurchase) {
          const matchedSubscription = await this.prisma.subscription.findFirst({
            where: {
              userId: user.id,
              OR: [
                { appleTransactionId: activeApplePurchase.transactionId },
                {
                  appleOriginalTransactionId:
                    activeApplePurchase.originalTransactionId,
                },
              ],
            },
            orderBy: { createdAt: 'desc' },
          });

          if (matchedSubscription) {
            subscriptionForResponse = await this.prisma.subscription.update({
              where: { id: matchedSubscription.id },
              data: {
                userId: user.id,
                status: SubscriptionStatus.ACTIVE,
                currentPeriodEnd: activeApplePurchase.expiresDate,
                appleTransactionId: activeApplePurchase.transactionId,
                appleOriginalTransactionId:
                  activeApplePurchase.originalTransactionId,
                appleProductId: activeApplePurchase.productId,
              },
            });
          } else {
            subscriptionForResponse = await this.prisma.subscription.create({
              data: {
                userId: user.id,
                status: SubscriptionStatus.ACTIVE,
                subscriptionType: 'apple_iap',
                currentPeriodEnd: activeApplePurchase.expiresDate,
                appleTransactionId: activeApplePurchase.transactionId,
                appleOriginalTransactionId:
                  activeApplePurchase.originalTransactionId,
                appleProductId: activeApplePurchase.productId,
                planName: 'Premium VPN',
              },
            });
            try {
              await this.prisma.subscriptionUser.create({
                data: {
                  subscriptionId: subscriptionForResponse.id,
                  userId: user.id,
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
          }
        }
      }

      const sessionToken = this.generateSessionToken(user.id);

      SafeLogger.info('Google sign-in completed successfully', {
        service: 'AuthService',
        userId: user.id,
      });

      if (createdUser) {
        void this.sendWelcomeEmailNonFatal({
          email: user.email,
          displayName: user.displayName,
        });
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName || '',
          displayName: user.displayName || '',
          emailVerified: user.emailVerified,
          provider: user.provider,
        },
        sessionToken,
        subscription: subscriptionForResponse
          ? {
              id: subscriptionForResponse.id,
              status: subscriptionForResponse.status,
              planName: subscriptionForResponse.planName,
              plan: this.resolveSubscriptionPlan(subscriptionForResponse),
              currentPeriodEnd: subscriptionForResponse.currentPeriodEnd,
              cancelAtPeriodEnd: subscriptionForResponse.cancelAtPeriodEnd,
              subscriptionType: subscriptionForResponse.subscriptionType,
            }
          : null,
        authMethod: 'google',
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      SafeLogger.error('Google sign-in failed', error, {
        service: 'AuthService',
      });
      throw new UnauthorizedException('Authentication failed');
    }
  }

  async appleSignIn(
    identityToken: string,
    userIdentifier: string,
    email: string,
    fullName: string,
    transactionIds?: Array<{
      transactionId: string;
      originalTransactionId: string;
      productId: string;
    }>,
    deviceFingerprint?: string,
    devicePlatform?: string,
    firebaseToken?: string,
  ) {
    try {
      // Try to verify Apple identity token using Apple's public keys
      // If that fails, fall back to decoding without verification (like vpn-backend-service)
      interface AppleJwtPayload {
        sub: string;
        email?: string;
        email_verified?: boolean | string;
        [key: string]: unknown;
      }

      let decodedToken: AppleJwtPayload;
      let appleUserId: string;
      let emailFromToken: string;
      let emailVerified: boolean;
      const provider = 'apple';

      try {
        // First attempt: Verify with Apple's public keys
        const verifiedToken =
          await this.appleTokenVerifier.verifyIdentityToken(identityToken);
        decodedToken = verifiedToken as unknown as AppleJwtPayload;
        appleUserId = decodedToken.sub || userIdentifier;
        emailFromToken = decodedToken.email || email;
        emailVerified =
          decodedToken.email_verified === true ||
          decodedToken.email_verified === 'true';

        SafeLogger.debug(
          'Apple token verified with signature',
          { service: 'AuthService' },
          { appleUserIdPrefix: appleUserId.substring(0, 8) },
        );
      } catch (verifyError) {
        // Security check: In production, we MUST NOT allow unverified tokens
        const isProduction = process.env.NODE_ENV === 'production';

        if (isProduction) {
          SafeLogger.error(
            'Apple token signature verification failed in production',
            verifyError instanceof Error
              ? verifyError
              : new Error(String(verifyError)),
            { service: 'AuthService' },
          );
          throw new UnauthorizedException(
            'Invalid Apple identity token signature',
          );
        }

        // Fallback (Dev/Test only): Decode without signature verification
        // This is strictly for development convenience when using mock tokens
        SafeLogger.warn(
          'MOCK TOKEN USED: Apple token signature verification failed - allowing in non-production',
          { service: 'AuthService' },
          { environment: process.env.NODE_ENV },
        );

        try {
          const tokenParts = identityToken.split('.');
          if (tokenParts.length !== 3) {
            throw new UnauthorizedException('Invalid JWT format');
          }

          const payloadBase64 = tokenParts[1];
          if (!payloadBase64) {
            throw new UnauthorizedException('Invalid JWT: missing payload');
          }

          // JWT uses base64url; Node Buffer expects standard base64
          const payloadBase64Standard = payloadBase64
            .replace(/-/g, '+')
            .replace(/_/g, '/');
          const decoded = JSON.parse(
            Buffer.from(payloadBase64Standard, 'base64').toString(),
          ) as AppleJwtPayload;

          // Validate required fields
          if (typeof decoded.sub !== 'string') {
            throw new UnauthorizedException('Invalid JWT payload: missing sub');
          }

          decodedToken = decoded;
          appleUserId = decoded.sub || userIdentifier;
          emailFromToken = decoded.email || email;
          emailVerified =
            decoded.email_verified === 'true' ||
            decoded.email_verified === true;

          SafeLogger.debug(
            'Apple token decoded without signature verification (Non-Production)',
            { service: 'AuthService' },
            {
              appleUserIdPrefix: appleUserId.substring(0, 8),
              hasEmail: !!decodedToken.email,
            },
          );
        } catch (decodeError) {
          SafeLogger.error(
            'Failed to decode Apple identity token',
            decodeError instanceof Error
              ? decodeError
              : new Error(String(decodeError)),
            { service: 'AuthService' },
          );
          throw new UnauthorizedException('Invalid Apple identity token');
        }
      }

      if (!userIdentifier && !appleUserId) {
        throw new UnauthorizedException(
          'userIdentifier required for Apple sign-in',
        );
      }

      // Find or create user by Apple user ID (not Firebase UID for Apple Sign-In)
      let user = await this.prisma.user.findUnique({
        where: { appleUserId },
      });

      let createdUser = false;
      if (!user) {
        // Check if user exists by email
        if (emailFromToken) {
          user = await this.prisma.user.findUnique({
            where: { email: emailFromToken },
          });
        }

        if (user) {
          // Block sign-in if this account is registered with a different provider
          if (user.provider === 'google') {
            throw new ConflictException(
              'This email is registered with Google. Please sign in with Google instead.',
            );
          }

          // Update existing user with Apple user ID
          // Only set email if user doesn't already have a Google-linked email
          // (prevents Apple relay email from overwriting the original Google email)
          const updateData: Record<string, unknown> = {
            appleUserId,
            displayName: fullName || user.displayName,
            emailVerified,
          };
          if (!user.firebaseUid) {
            // No Google account linked — safe to update email
            updateData.email = emailFromToken || user.email;
          }
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });
        } else {
          // Create new user — brand new Apple account, no existing user
          user = await this.prisma.user.create({
            data: {
              appleUserId,
              email: emailFromToken || `apple_${appleUserId}@temp.com`,
              displayName: fullName,
              provider,
              emailVerified,
            },
          });
          createdUser = true;
        }
      } else {
        // User found by appleUserId — returning Apple user
        // Only update email if this user doesn't have a linked Google account
        // (prevents Apple relay email from overwriting the original Google email)
        const updateData: Record<string, unknown> = {
          displayName: fullName || user.displayName,
          emailVerified,
        };
        if (!user.firebaseUid) {
          // No Google account linked — safe to update email
          updateData.email = emailFromToken || user.email;
        }
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      }

      // Link Firebase UID so Stripe checkout can look up this user by firebaseUid
      let firebaseLinkError: string | null = null;
      if (firebaseToken && !user.firebaseUid) {
        try {
          const fbDecoded = await this.firebaseConfig
            .getAuth()
            .verifyIdToken(firebaseToken);

          // Guard against unique-constraint violation: if this Firebase UID is
          // already owned by a different user (e.g. a Google account), skip the
          // link rather than throwing and silently swallowing the error.
          const existingFbUser = await this.prisma.user.findUnique({
            where: { firebaseUid: fbDecoded.uid },
          });

          if (existingFbUser && existingFbUser.id !== user.id) {
            firebaseLinkError = 'conflict';
            SafeLogger.warn(
              'Firebase UID already linked to a different user — skipping link',
              { service: 'AuthService' },
              { existingUserId: existingFbUser.id, currentUserId: user.id },
            );
          } else {
            user = await this.prisma.user.update({
              where: { id: user.id },
              data: { firebaseUid: fbDecoded.uid },
            });
          }
        } catch (e) {
          // Prisma unique-constraint violation = the Firebase UID was just linked by
          // a concurrent request — treat it the same as the pre-flight conflict check.
          const isPrismaUniqueViolation =
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002';

          firebaseLinkError = isPrismaUniqueViolation
            ? 'conflict'
            : 'verification_failed';

          SafeLogger.warn(
            'Could not link Firebase UID during Apple sign-in',
            { service: 'AuthService' },
            { error: e instanceof Error ? e.message : String(e) },
          );
        }
      }

      const sessionToken = this.generateSessionToken(user.id);

      const activeSubscription = await getActiveSubscriptionForUser(
        this.prisma,
        user.id,
      );

      SafeLogger.info(
        'Apple sign-in completed successfully',
        { service: 'AuthService', userId: user.id },
        { devicePlatform, hasActiveSubscription: !!activeSubscription },
      );

      if (createdUser) {
        void this.sendWelcomeEmailNonFatal({
          email: user.email,
          displayName: user.displayName,
        });
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName || '',
        },
        sessionToken,
        authMethod: 'apple',
        firebaseLinked: !!user.firebaseUid,
        ...(firebaseLinkError && { firebaseLinkError }),
        subscription: activeSubscription
          ? {
              id: activeSubscription.id,
              status: activeSubscription.status,
              planName: activeSubscription.planName,
              plan: this.resolveSubscriptionPlan(activeSubscription),
              currentPeriodEnd: activeSubscription.currentPeriodEnd,
              cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
              subscriptionType: activeSubscription.subscriptionType,
            }
          : null,
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      SafeLogger.error('Apple sign-in failed', error, {
        service: 'AuthService',
      });
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }

  async verifySession(sessionToken: string) {
    try {
      if (!sessionToken) {
        SafeLogger.error('Request body is missing', new Error('Missing body'), {
          service: 'AuthController',
          path: '/auth/verify',
        });
        throw new BadRequestException('Request body is missing');
      }

      const secret =
        this.configService?.get<string>('JWT_SECRET') ||
        process.env.JWT_SECRET ||
        'default-secret-change-in-production';
      const decoded = jwt.verify(sessionToken, secret) as {
        userId: string;
        type: string;
      };

      if (decoded.type !== 'session') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Get active subscription
      const activeSubscription = await getActiveSubscriptionForUser(
        this.prisma,
        user.id,
      );

      // Check trial status
      let trial: {
        active: boolean;
        tier: string;
        startsAt: string | null;
        endsAt: string | null;
        daysRemaining: number | null;
      } | null = null;

      if (user.trialActive) {
        const now = new Date();
        const trialEndsAt = user.trialEndsAt;
        const trialStartsAt = user.trialStartsAt;

        // Check if trial is still valid (not expired)
        const isTrialValid = !trialEndsAt || trialEndsAt >= now;

        if (isTrialValid) {
          trial = {
            active: true,
            tier: user.trialTier || 'premium',
            startsAt: trialStartsAt?.toISOString() || null,
            endsAt: trialEndsAt?.toISOString() || null,
            daysRemaining: trialEndsAt
              ? Math.max(
                  0,
                  Math.ceil(
                    (trialEndsAt.getTime() - now.getTime()) /
                      (1000 * 60 * 60 * 24),
                  ),
                )
              : null,
          };
        } else {
          // Trial expired, update user
          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              trialActive: false,
            },
          });
        }
      }

      SafeLogger.info(
        'Session verified successfully',
        { service: 'AuthService', userId: user.id },
        { hasSubscription: !!activeSubscription, hasTrial: !!trial },
      );

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName || '',
          provider: user.provider,
        },
        subscription: activeSubscription
          ? {
              id: activeSubscription.id,
              status: activeSubscription.status,
              planName: activeSubscription.planName,
              plan: this.resolveSubscriptionPlan(activeSubscription),
              currentPeriodEnd: activeSubscription.currentPeriodEnd,
              cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
              subscriptionType: activeSubscription.subscriptionType,
            }
          : null,
        trial,
      };
    } catch (error) {
      SafeLogger.error('Session verification failed', error, {
        service: 'AuthService',
      });
      throw new UnauthorizedException('Invalid session token');
    }
  }

  /**
   * Resolves the human-readable plan name from subscription data.
   * Handles cases where planName is generic (e.g. "Premium VPN") by
   * deriving the qualifier from appleProductId or subscriptionType.
   */
  private resolveSubscriptionPlan(subscription: {
    planName: string | null;
    appleProductId?: string | null;
    subscriptionType?: string | null;
    billingPeriod?: string | null;
  }): string {
    const planName = subscription.planName || '';
    const productId = subscription.appleProductId || '';

    // If planName already contains a qualifier, use it as-is
    if (
      planName.toLowerCase().includes('monthly') ||
      planName.toLowerCase().includes('annual') ||
      planName.toLowerCase().includes('yearly')
    ) {
      return planName;
    }

    // Derive from appleProductId for Apple IAP subscriptions
    if (productId.includes('yearly') || productId.includes('annual')) {
      return 'Premium VPN - Annual';
    }
    if (productId.includes('monthly')) {
      return 'Premium VPN - Monthly';
    }

    // Derive from billingPeriod for Stripe subscriptions
    if (subscription.billingPeriod === 'month') {
      return 'Premium VPN - Monthly';
    }
    if (subscription.billingPeriod === 'year') {
      return 'Premium VPN - Annual';
    }

    return planName;
  }

  async linkProvider(
    userId: string,
    provider: 'google' | 'apple',
    firebaseIdToken: string,
  ) {
    const primaryUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!primaryUser) {
      throw new UnauthorizedException('User not found');
    }

    // Reject if the user is trying to link the same provider they signed up with
    if (provider === primaryUser.provider) {
      throw new ConflictException(
        `${provider === 'google' ? 'Google' : 'Apple'} account is already linked`,
      );
    }

    // Reject if the user already has a linked account with this provider type
    const existingLinks = await this.prisma.linkedAccount.findMany({
      where: { OR: [{ primaryUserId: userId }, { linkedUserId: userId }] },
    });
    if (existingLinks.length > 0) {
      const linkedUserIds = existingLinks.map((la) =>
        la.primaryUserId === userId ? la.linkedUserId : la.primaryUserId,
      );
      const linkedUsers = await this.prisma.user.findMany({
        where: { id: { in: linkedUserIds } },
      });
      const alreadyHasProvider = linkedUsers.some((lu) =>
        provider === 'apple'
          ? !!lu.appleUserId || lu.provider === 'apple'
          : !!lu.googleUserId || lu.provider === 'google',
      );
      if (alreadyHasProvider) {
        throw new ConflictException(
          `${provider === 'google' ? 'Google' : 'Apple'} account is already linked`,
        );
      }
    }

    const decodedToken = await this.firebaseConfig
      .getAuth()
      .verifyIdToken(firebaseIdToken);
    const firebaseUid = decodedToken.uid;
    const emailFromToken = decodedToken.email;

    // Extract provider-specific identifiers from Firebase token identities
    const firebaseClaim = decodedToken.firebase as
      | { identities?: Record<string, string[]> }
      | undefined;
    const appleIdentities = firebaseClaim?.identities?.['apple.com'];
    const appleUserIdFromToken = appleIdentities?.[0] || undefined;

    let secondaryUser = await this.prisma.user.findUnique({
      where: { firebaseUid },
    });

    // If the firebaseUid lookup found the primary user (e.g. the token belongs
    // to the caller after a successful Firebase linkWithPopup), reset so the
    // appleUserId and email lookups below can still find the actual secondary.
    if (secondaryUser && secondaryUser.id === primaryUser.id) {
      secondaryUser = null;
    }

    if (!secondaryUser && provider === 'apple' && appleUserIdFromToken) {
      secondaryUser = await this.prisma.user.findUnique({
        where: { appleUserId: appleUserIdFromToken },
      });
    }

    if (!secondaryUser && emailFromToken) {
      const emailUser = await this.prisma.user.findUnique({
        where: { email: emailFromToken },
      });
      if (emailUser && emailUser.id !== primaryUser.id) {
        secondaryUser = emailUser;
      }
    }

    if (!secondaryUser || secondaryUser.id === primaryUser.id) {
      // No secondary user exists — create one for the linked provider identity
      if (provider === 'apple') {
        if (!appleUserIdFromToken) {
          throw new BadRequestException(
            'Could not extract Apple identity from the provided token. Please try again.',
          );
        }
      }

      // Only set firebaseUid on the secondary if it differs from the primary's
      // (e.g. from the credential-already-in-use temp app flow).
      // When provider-already-linked sends the primary user's token, the UIDs match.
      const secondaryFirebaseUid =
        firebaseUid !== primaryUser.firebaseUid ? firebaseUid : undefined;

      try {
        secondaryUser = await this.prisma.user.create({
          data: {
            email: emailFromToken || `${firebaseUid}@linked.keenvpn.com`,
            provider,
            firebaseUid: secondaryFirebaseUid,
            appleUserId:
              provider === 'apple' ? appleUserIdFromToken : undefined,
          },
        });
      } catch (e: unknown) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          // Unique constraint failed (e.g. email collision) — look up the existing
          // user instead of throwing a misleading "already linked" error.
          const fallbackUser = emailFromToken
            ? await this.prisma.user.findUnique({
                where: { email: emailFromToken },
              })
            : null;
          if (fallbackUser && fallbackUser.id !== primaryUser.id) {
            secondaryUser = fallbackUser;
          } else {
            throw new ConflictException(
              'This account is already linked to another user.',
            );
          }
        } else {
          throw e;
        }
      }

      if (!secondaryUser) {
        throw new ConflictException(
          'Could not resolve secondary account for linking.',
        );
      }

      SafeLogger.info(
        'Created secondary user for provider linking',
        { service: 'AuthService', userId },
        { secondaryUserId: secondaryUser.id, provider },
      );
    }

    // Check if the secondary user is already linked to a different account
    const existingLink = await this.prisma.linkedAccount.findFirst({
      where: {
        OR: [
          { primaryUserId: secondaryUser.id },
          { linkedUserId: secondaryUser.id },
        ],
      },
    });

    if (existingLink) {
      // If the existing link connects this same pair, it's a valid re-link — return success
      const isSamePair =
        (existingLink.primaryUserId === primaryUser.id &&
          existingLink.linkedUserId === secondaryUser.id) ||
        (existingLink.primaryUserId === secondaryUser.id &&
          existingLink.linkedUserId === primaryUser.id);
      if (isSamePair) {
        return {
          success: true,
          linkedProviders: {
            google:
              !!primaryUser.googleUserId ||
              primaryUser.provider === 'google' ||
              !!secondaryUser.googleUserId ||
              secondaryUser.provider === 'google',
            apple:
              !!primaryUser.appleUserId ||
              primaryUser.provider === 'apple' ||
              !!secondaryUser.appleUserId ||
              secondaryUser.provider === 'apple',
          },
        };
      }
      throw new ConflictException(
        'This account is already linked to another user.',
      );
    }

    // Ensure the secondary user has the correct provider identity fields.
    // This handles the case where the secondary was originally created via a
    // different sign-in method (e.g. googleSignIn) and is now being linked
    // as the other provider. Runs after the existingLink check to avoid
    // mutating state on rejected link attempts.
    if (provider === 'apple' && appleUserIdFromToken) {
      if (
        secondaryUser.provider !== 'apple' ||
        secondaryUser.appleUserId !== appleUserIdFromToken
      ) {
        secondaryUser = await this.prisma.user.update({
          where: { id: secondaryUser.id },
          data: {
            provider: 'apple',
            appleUserId: appleUserIdFromToken,
          },
        });
      }
    } else if (provider === 'google') {
      if (secondaryUser.provider !== 'google') {
        const updateData: Record<string, unknown> = { provider: 'google' };
        if (
          firebaseUid &&
          firebaseUid !== primaryUser.firebaseUid &&
          !secondaryUser.firebaseUid
        ) {
          updateData.firebaseUid = firebaseUid;
        }
        secondaryUser = await this.prisma.user.update({
          where: { id: secondaryUser.id },
          data: updateData,
        });
      }
    }

    const primarySub = await getActiveSubscriptionForUser(
      this.prisma,
      primaryUser.id,
    );
    const secondarySub = await getActiveSubscriptionForUser(
      this.prisma,
      secondaryUser.id,
    );

    if (primarySub && secondarySub) {
      throw new ConflictException(
        'Both accounts have active subscriptions. Please cancel one subscription before linking.',
      );
    }

    try {
      await this.prisma.linkedAccount.create({
        data: { primaryUserId: primaryUser.id, linkedUserId: secondaryUser.id },
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

    const activeSub = primarySub || secondarySub;
    if (activeSub) {
      const linkedUserId =
        activeSub.userId === primaryUser.id ? secondaryUser.id : primaryUser.id;

      try {
        await this.prisma.subscriptionUser.create({
          data: {
            subscriptionId: activeSub.id,
            userId: linkedUserId,
            role: SubscriptionUserRole.LINKED,
          },
        });
      } catch (e: unknown) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Accounts are already linked');
        }
        throw e;
      }
    }

    SafeLogger.info(
      'Accounts linked via subscription_users',
      { service: 'AuthService', userId },
      { secondaryUserId: secondaryUser.id, provider },
    );

    return {
      success: true,
      linkedProviders: {
        google:
          !!primaryUser.googleUserId ||
          primaryUser.provider === 'google' ||
          !!secondaryUser.googleUserId ||
          secondaryUser.provider === 'google',
        apple:
          !!primaryUser.appleUserId ||
          primaryUser.provider === 'apple' ||
          !!secondaryUser.appleUserId ||
          secondaryUser.provider === 'apple',
      },
    };
  }

  async unlinkProvider(userId: string, provider: 'google' | 'apple') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.provider === provider) {
      throw new BadRequestException(
        'Cannot unlink your primary sign-in provider.',
      );
    }

    // Only LinkedAccount-based unlinking — find the linked account with the target provider
    const linkedAccounts = await this.prisma.linkedAccount.findMany({
      where: { OR: [{ primaryUserId: userId }, { linkedUserId: userId }] },
    });

    if (linkedAccounts.length > 0) {
      const linkedUserIds = linkedAccounts.map((la) =>
        la.primaryUserId === userId ? la.linkedUserId : la.primaryUserId,
      );
      const linkedUsers = await this.prisma.user.findMany({
        where: { id: { in: linkedUserIds } },
      });

      for (const linkedUser of linkedUsers) {
        const hasTargetProvider =
          provider === 'apple'
            ? !!linkedUser.appleUserId || linkedUser.provider === 'apple'
            : !!linkedUser.googleUserId || linkedUser.provider === 'google';

        if (hasTargetProvider) {
          const linkedAccount = linkedAccounts.find(
            (la) =>
              la.primaryUserId === linkedUser.id ||
              la.linkedUserId === linkedUser.id,
          );
          if (linkedAccount) {
            await this.prisma.linkedAccount.delete({
              where: { id: linkedAccount.id },
            });

            // Scope deletion to subscriptions owned by either user in this pair
            const ownedSubs = await this.prisma.subscription.findMany({
              where: { userId: { in: [userId, linkedUser.id] } },
              select: { id: true },
            });
            const ownedSubIds = ownedSubs.map((s) => s.id);

            if (ownedSubIds.length > 0) {
              await this.prisma.subscriptionUser.deleteMany({
                where: {
                  role: SubscriptionUserRole.LINKED,
                  subscriptionId: { in: ownedSubIds },
                  userId: { in: [userId, linkedUser.id] },
                },
              });
            }

            SafeLogger.info(
              'Provider unlinked (LinkedAccount bridge)',
              { service: 'AuthService', userId },
              { linkedUserId: linkedUser.id, provider },
            );
            return;
          }
        }
      }
    }

    throw new NotFoundException('This provider is not linked to your account.');
  }

  private async sendWelcomeEmailNonFatal(user: {
    email: string;
    displayName?: string | null;
  }): Promise<void> {
    try {
      await this.emailService?.sendWelcomeEmail(user);
    } catch (error) {
      SafeLogger.warn(
        'Welcome email skipped after account creation',
        { service: 'AuthService' },
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  }
}
