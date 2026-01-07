import { Injectable, UnauthorizedException } from '@nestjs/common';
import { FirebaseConfig } from '../config/firebase.config';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';

@Injectable()
export class AuthService {
  constructor(
    private firebaseConfig: FirebaseConfig,
    private prisma: PrismaService,
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
}

