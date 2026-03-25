import {
  Injectable,
  UnauthorizedException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseConfig } from '../config/firebase.config';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus, Prisma } from '@prisma/client';
import { SafeLogger } from '../common/utils/logger.util';
import { AppleTokenVerifierService } from './apple-token-verifier.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(
    @Inject(FirebaseConfig) private firebaseConfig: FirebaseConfig,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(AppleTokenVerifierService)
    private appleTokenVerifier: AppleTokenVerifierService,
  ) {}

  async login(idToken: string) {
    try {
      // Verify Firebase ID token
      const decodedToken = await this.firebaseConfig
        .getAuth()
        .verifyIdToken(idToken);

      const firebaseUid = decodedToken.uid;
      const email = decodedToken.email;
      const displayName = (decodedToken.name as string) || '';
      const emailVerified = decodedToken.email_verified || false;
      const provider = decodedToken.firebase?.sign_in_provider || 'google';

      if (!email) {
        throw new UnauthorizedException('Email not found in token');
      }

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { firebaseUid },
      });

      if (!user) {
        // Check if user exists by email
        user = await this.prisma.user.findUnique({
          where: { email },
        });

        if (user) {
          // Update existing user with Firebase UID
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { firebaseUid },
          });
        } else {
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
        }
      } else {
        // Update user info
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            email,
            displayName,
            emailVerified,
          },
        });
      }

      // Get user ID for subscription lookup
      const userId = user.id;

      // Get active subscription
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
          OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      SafeLogger.info(
        'User logged in successfully',
        { service: 'AuthService', userId },
        { hasActiveSubscription: !!activeSubscription },
      );

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

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { firebaseUid },
      });

      if (!user) {
        // Check if user exists by email
        user = await this.prisma.user.findUnique({
          where: { email },
        });

        if (user) {
          // Update existing user with Firebase UID
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { firebaseUid, displayName, emailVerified },
          });
        } else {
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
        }
      } else {
        // Update user info
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            email,
            displayName,
            emailVerified,
          },
        });
      }

      // Handle merged users — redirect to primary
      if (user.mergedIntoUserId) {
        const primaryUser = await this.prisma.user.findUnique({
          where: { id: user.mergedIntoUserId },
        });
        if (primaryUser) {
          user = primaryUser;
        }
      }

      const prioritizedSubscription = await this.prisma.subscription.findFirst({
        where: {
          userId: user.id,
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

      const latestSubscription =
        prioritizedSubscription ??
        (await this.prisma.subscription.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
        }));

      let subscriptionForResponse = latestSubscription;

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
          }
        }
      }

      const sessionToken = this.generateSessionToken(user.id);

      SafeLogger.info('Google sign-in completed successfully', {
        service: 'AuthService',
        userId: user.id,
      });

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
            decoded.email_verified === true ||
            true;

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

      if (!user) {
        // Check if user exists by email
        if (emailFromToken) {
          user = await this.prisma.user.findUnique({
            where: { email: emailFromToken },
          });
        }

        if (user) {
          // Update existing user with Apple user ID
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: {
              appleUserId,
              email: emailFromToken || user.email,
              displayName: fullName || user.displayName,
              emailVerified,
            },
          });
        } else {
          // Create new user
          user = await this.prisma.user.create({
            data: {
              appleUserId,
              email: emailFromToken || `apple_${appleUserId}@temp.com`,
              displayName: fullName,
              provider,
              emailVerified,
            },
          });
        }
      } else {
        // Update user info
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            email: emailFromToken || user.email,
            displayName: fullName || user.displayName,
            emailVerified,
          },
        });
      }

      // Handle merged users — redirect to primary
      if (user.mergedIntoUserId) {
        const primaryUser = await this.prisma.user.findUnique({
          where: { id: user.mergedIntoUserId },
        });
        if (primaryUser) {
          user = primaryUser;
        }
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

      SafeLogger.info(
        'Apple sign-in completed successfully',
        { service: 'AuthService', userId: user.id },
        { devicePlatform },
      );

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
      };
    } catch (error) {
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

      if (!sessionToken) {
        SafeLogger.warn('sessionToken is missing from body', {
          service: 'AuthController',
          body: sessionToken,
        });
        throw new BadRequestException('sessionToken is required');
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
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: {
          userId: user.id,
          status: SubscriptionStatus.ACTIVE,
          OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

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

    return planName;
  }
}
