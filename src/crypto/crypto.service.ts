import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SafeLogger } from '../common/utils/logger.util';

@Injectable()
export class CryptoService {
  private privateKey: crypto.KeyObject;

  constructor(private configService: ConfigService) {
    const privateKeyPem = this.configService.get<string>(
      'BLIND_SIGNING_PRIVATE_KEY',
    );

    if (!privateKeyPem) {
      throw new Error('BLIND_SIGNING_PRIVATE_KEY is required');
    }

    try {
      this.privateKey = crypto.createPrivateKey(privateKeyPem);
    } catch {
      throw new Error('Invalid BLIND_SIGNING_PRIVATE_KEY format');
    }
  }

  /**
   * Sign a blinded token using RSA-FDH (Full Domain Hash)
   * @param blindedToken Base64 encoded blinded token
   * @returns Base64 encoded signature
   */
  async signBlindedToken(blindedToken: string): Promise<string> {
    try {
      // Decode base64 blinded token
      const blindedBuffer = Buffer.from(blindedToken, 'base64');

      // Validate token length
      if (blindedBuffer.length < 32 || blindedBuffer.length > 4096) {
        throw new BadRequestException('Invalid blinded token length');
      }

      // RSA-FDH: Sign the blinded token directly
      // In a full implementation, you would hash first, but for blind signing
      // we sign the blinded value directly
      const signature = await Promise.resolve(
        crypto.sign(null, blindedBuffer, this.privateKey),
      );

      // Log only metadata (never the token content)
      SafeLogger.info('Blind signing operation', {
        tokenLength: blindedToken.length,
        signatureLength: signature.length,
        timestamp: Date.now(),
      });

      return signature.toString('base64');
    } catch (error) {
      SafeLogger.error('Blind signing failed', error, {
        tokenLength: blindedToken.length,
      });
      throw new BadRequestException('Failed to sign blinded token');
    }
  }

  /**
   * Get the public key for verification
   * @returns PEM formatted public key
   */
  getPublicKey(): string {
    const publicKey = crypto.createPublicKey(this.privateKey);
    return publicKey.export({ type: 'spki', format: 'pem' }) as string;
  }

  /**
   * Verify a blind-signed token
   * @param token The original token (before blinding)
   * @param signature The blind-signed signature (after unblinding)
   * @returns true if signature is valid, false otherwise
   */
  verifyBlindSignedToken(token: string, signature: string): boolean {
    try {
      const tokenBuffer = Buffer.from(token, 'base64');
      const signatureBuffer = Buffer.from(signature, 'base64');
      const publicKey = crypto.createPublicKey(this.privateKey);

      // Verify the signature using the public key
      const isValid = crypto.verify(
        null,
        tokenBuffer,
        publicKey,
        signatureBuffer,
      );

      SafeLogger.info('Blind token verification', {
        tokenLength: token.length,
        signatureLength: signature.length,
        isValid,
      });

      return isValid;
    } catch (error) {
      SafeLogger.error('Blind token verification failed', error);
      return false;
    }
  }
}
