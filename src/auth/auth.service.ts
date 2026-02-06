import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseConfig } from '../config/firebase.config';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { AppleTokenVerifierService } from './apple-token-verifier.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(
    private firebaseConfig: FirebaseConfig,
    private prisma: PrismaService,
    private configService: ConfigService,
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
      const displayName = decodedToken.name;
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
          status: 'active',
          OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      SafeLogger.info('User logged in', {
        userId,
        email: '[REDACTED]',
        hasActiveSubscription: !!activeSubscription,
      });

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
    } catch (error) {
      SafeLogger.error('Login failed', error);
      throw new UnauthorizedException('Invalid token');
    }
  }

  async logout(userId: string) {
    // Server-side cleanup if needed
    // For Firebase, tokens are stateless, so we just log the logout
    SafeLogger.info('User logged out', { userId });
    return { success: true };
  }

  private generateSessionToken(userId: string, email: string): string {
    const secret =
      this.configService.get<string>('JWT_SECRET') ||
      'default-secret-change-in-production';
    return jwt.sign(
      { userId, email, type: 'session' },
      secret,
      { expiresIn: '90d' }, // 90 days session
    );
  }

  async googleSignIn(
    idToken: string,
    deviceFingerprint?: string,
    devicePlatform?: string,
  ) {
    try {
      // Verify Firebase ID token
      const decodedToken = await this.firebaseConfig
        .getAuth()
        .verifyIdToken(idToken);

      const firebaseUid = decodedToken.uid;
      const email = decodedToken.email;
      const displayName = decodedToken.name;
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

      const sessionToken = this.generateSessionToken(user.id, user.email);

      SafeLogger.info('Google sign in successful', {
        userId: user.id,
        email: '[REDACTED]',
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName || '',
        },
        sessionToken,
        authMethod: 'google',
      };
    } catch (error) {
      SafeLogger.error('Google sign in failed', error);
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
  ) {
    try {
      // Try to verify Apple identity token using Apple's public keys
      // If that fails, fall back to decoding without verification (like vpn-backend-service)
      let decodedToken: any;
      let appleUserId: string;
      let emailFromToken: string;
      let emailVerified: boolean;
      const provider = 'apple';

      try {
        // First attempt: Verify with Apple's public keys
        decodedToken =
          await this.appleTokenVerifier.verifyIdentityToken(identityToken);
        appleUserId = decodedToken.sub || userIdentifier;
        emailFromToken = decodedToken.email || email;
        emailVerified = decodedToken.email_verified ?? true;

        SafeLogger.info('Apple token verified with signature', {
          appleUserId: appleUserId.substring(0, 8) + '...',
        });
      } catch (verifyError) {
        // Fallback: Decode without signature verification (for native apps)
        // This matches the behavior of vpn-backend-service
        SafeLogger.warn(
          'Apple token signature verification failed, decoding without verification',
          {
            error:
              verifyError instanceof Error
                ? verifyError.message
                : String(verifyError),
          },
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

          decodedToken = JSON.parse(
            Buffer.from(payloadBase64, 'base64').toString(),
          );

          appleUserId = decodedToken.sub || userIdentifier;
          emailFromToken = decodedToken.email || email;
          emailVerified =
            decodedToken.email_verified === 'true' ||
            decodedToken.email_verified === true ||
            true;

          SafeLogger.info(
            'Apple token decoded without signature verification',
            {
              appleUserId: appleUserId.substring(0, 8) + '...',
              hasEmail: !!decodedToken.email,
            },
          );
        } catch (decodeError) {
          SafeLogger.error(
            'Failed to decode Apple identity token',
            decodeError,
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

      const sessionToken = this.generateSessionToken(user.id, user.email);

      SafeLogger.info('Apple sign in successful', {
        userId: user.id,
        email: '[REDACTED]',
        deviceFingerprint: deviceFingerprint
          ? deviceFingerprint.substring(0, 16) + '...'
          : 'N/A',
        devicePlatform,
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName || '',
        },
        sessionToken,
        authMethod: 'apple',
      };
    } catch (error) {
      SafeLogger.error('Apple sign in failed', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  async verifySession(
    sessionToken: string,
    deviceFingerprint?: string,
    devicePlatform?: string,
  ) {
    try {
      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'default-secret-change-in-production';
      const decoded = jwt.verify(sessionToken, secret) as {
        userId: string;
        email: string;
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
          status: 'active',
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

      SafeLogger.info('Session verified', {
        userId: user.id,
        email: '[REDACTED]',
        hasSubscription: !!activeSubscription,
        hasTrial: !!trial,
      });

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
              currentPeriodEnd: activeSubscription.currentPeriodEnd,
              cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
              subscriptionType: activeSubscription.subscriptionType,
            }
          : null,
        trial,
      };
    } catch (error) {
      SafeLogger.error('Session verification failed', error);
      throw new UnauthorizedException('Invalid session token');
    }
  }
}
