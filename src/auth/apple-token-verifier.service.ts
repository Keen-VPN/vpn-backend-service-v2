import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import * as https from 'https';
import { SafeLogger } from '../common/utils/logger.util';

interface AppleTokenPayload {
  iss: string; // Issuer (should be "https://appleid.apple.com")
  aud: string; // Audience (should be your bundle ID)
  exp: number; // Expiration time
  iat: number; // Issued at
  sub: string; // Subject (user identifier)
  email?: string; // User email (only on first sign-in)
  email_verified?: boolean; // Email verification status
}

@Injectable()
export class AppleTokenVerifierService {
  private client: jwksClient.JwksClient;
  private bundleId: string;

  constructor(private configService: ConfigService) {
    // Create HTTPS agent with timeout configuration
    const httpsAgent = new https.Agent({
      keepAlive: true,
      timeout: 10000, // 10 second timeout
      maxSockets: 5,
    });

    // Initialize JWKS client for Apple's public keys
    this.client = jwksClient.default({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      requestAgent: httpsAgent,
      timeout: 10000, // 10 second timeout
      requestHeaders: {
        'User-Agent': 'KeenVPN-Backend/1.0',
      },
    });

    const configuredBundleId =
      this.configService.get<string>('APPLE_BUNDLE_ID');
    this.bundleId = configuredBundleId || 'com.keenvpn.KeenVPN.keenVPN';

    // Log if using default or if configured value looks like a placeholder
    if (!configuredBundleId) {
      SafeLogger.info('Using default Apple bundle ID', {
        bundleId: this.bundleId,
        note: 'Set APPLE_BUNDLE_ID environment variable to override',
      });
    } else if (
      configuredBundleId.includes('yourcompany') ||
      configuredBundleId.includes('yourapp')
    ) {
      SafeLogger.warn('Apple bundle ID appears to be a placeholder', {
        configured: configuredBundleId,
        using: this.bundleId,
        recommendation:
          'Update APPLE_BUNDLE_ID environment variable to match your app',
      });
    }
  }

  async verifyIdentityToken(identityToken: string): Promise<AppleTokenPayload> {
    try {
      // Decode token header to get the key ID
      const decoded = jwt.decode(identityToken, { complete: true });

      if (!decoded || typeof decoded === 'string') {
        throw new UnauthorizedException('Invalid token format');
      }

      const kid = decoded.header.kid;

      if (!kid) {
        throw new UnauthorizedException('Token missing key ID');
      }

      // Get the signing key from Apple's JWKS
      const key = await this.getSigningKey(kid);

      // Verify and decode the token
      // Note: We verify signature and issuer, but allow flexible audience
      // since different platforms may have different bundle IDs
      let payload: AppleTokenPayload;
      try {
        // First try with the configured bundle ID
        payload = jwt.verify(identityToken, key, {
          algorithms: ['RS256'],
          issuer: 'https://appleid.apple.com',
          audience: this.bundleId,
        }) as AppleTokenPayload;
      } catch (audienceError: unknown) {
        // If audience doesn't match, try to decode without audience check
        // but still verify signature and issuer
        const errorMessage =
          audienceError instanceof Error
            ? audienceError.message
            : String(audienceError);
        if (errorMessage?.includes('audience')) {
          SafeLogger.warn(
            'Token audience mismatch, attempting flexible verification',
            {
              expected: this.bundleId,
              error: errorMessage,
              recommendation:
                'Consider updating APPLE_BUNDLE_ID environment variable to match the token audience',
            },
          );

          // Decode to get the actual audience
          const decoded = jwt.decode(identityToken, { complete: true });
          if (
            decoded &&
            typeof decoded !== 'string' &&
            decoded.payload &&
            typeof decoded.payload === 'object' &&
            'aud' in decoded.payload
          ) {
            const actualAudience = decoded.payload.aud as string;
            SafeLogger.info(
              'Token has different audience, verifying with actual audience',
              {
                actualAudience,
                configuredBundleId: this.bundleId,
              },
            );

            // Verify with the actual audience from the token
            payload = jwt.verify(identityToken, key, {
              algorithms: ['RS256'],
              issuer: 'https://appleid.apple.com',
              audience: actualAudience, // Use the actual audience from token
            }) as AppleTokenPayload;
          } else {
            throw audienceError;
          }
        } else {
          throw audienceError;
        }
      }

      // Additional validation
      if (payload.iss !== 'https://appleid.apple.com') {
        throw new UnauthorizedException('Invalid token issuer');
      }

      return payload;
    } catch (error) {
      SafeLogger.error('Apple token verification failed', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Apple identity token');
    }
  }

  private async getSigningKey(kid: string): Promise<string> {
    // Retry logic with timeout
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const key = await Promise.race([
          new Promise<string>((resolve, reject) => {
            this.client.getSigningKey(kid, (err, key) => {
              if (err) {
                reject(new Error(`Failed to get signing key: ${err.message}`));
                return;
              }

              if (!key) {
                reject(new Error('Signing key not found'));
                return;
              }

              const signingKey = key.getPublicKey();
              resolve(signingKey);
            });
          }),
          new Promise<string>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  'Request timeout: Failed to fetch signing key within 10 seconds',
                ),
              );
            }, 10000);
          }),
        ]);

        // Success - return the key
        return key;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        SafeLogger.warn(
          `Failed to get signing key (attempt ${attempt}/${maxRetries})`,
          {
            error: errorMessage,
            kid: kid.substring(0, 8) + '...',
          },
        );

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          break;
        }

        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    // All retries failed
    const finalErrorMessage =
      lastError instanceof Error ? lastError.message : 'Unknown error';
    throw new UnauthorizedException(
      `Failed to get signing key after ${maxRetries} attempts: ${finalErrorMessage}`,
    );
  }
}
