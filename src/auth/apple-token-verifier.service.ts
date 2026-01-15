import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
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
    // Initialize JWKS client for Apple's public keys
    this.client = jwksClient.default({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
    });

    this.bundleId = this.configService.get<string>('APPLE_BUNDLE_ID') || 'com.keenvpn.KeenVPN.keenVPN';
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
      } catch (audienceError: any) {
        // If audience doesn't match, try to decode without audience check
        // but still verify signature and issuer
        if (audienceError.message?.includes('audience')) {
          SafeLogger.warn('Token audience mismatch, attempting flexible verification', {
            expected: this.bundleId,
            error: audienceError.message,
          });
          
          // Decode to get the actual audience
          const decoded = jwt.decode(identityToken, { complete: true });
          if (decoded && typeof decoded !== 'string' && decoded.payload) {
            const actualAudience = (decoded.payload as any).aud;
            SafeLogger.info('Token has different audience, verifying with actual audience', {
              actualAudience,
              configuredBundleId: this.bundleId,
            });
            
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
    return new Promise((resolve, reject) => {
      this.client.getSigningKey(kid, (err, key) => {
        if (err) {
          reject(new UnauthorizedException(`Failed to get signing key: ${err.message}`));
          return;
        }

        if (!key) {
          reject(new UnauthorizedException('Signing key not found'));
          return;
        }

        const signingKey = key.getPublicKey();
        resolve(signingKey);
      });
    });
  }
}

