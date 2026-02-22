import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SafeLogger } from '../common/utils/logger.util';

@Injectable()
export class CryptoService {
  private privateKey: crypto.KeyObject;

  constructor(@Inject(ConfigService) private configService: ConfigService) {
    const privateKeyPem =
      this.configService?.get<string>('BLIND_SIGNING_PRIVATE_KEY') ||
      process.env.BLIND_SIGNING_PRIVATE_KEY;

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
      let blindedBuffer = Buffer.from(blindedToken, 'base64');

      // Validate token length
      if (blindedBuffer.length < 32 || blindedBuffer.length > 4096) {
        throw new BadRequestException('Invalid blinded token length');
      }

      // Get the key size (for RSA-2048, this is 256 bytes)
      const publicKey = crypto.createPublicKey(this.privateKey);
      const keySize =
        (publicKey.asymmetricKeyDetails?.modulusLength || 2048) / 8;

      // For raw RSA (no padding), the input must be exactly keySize bytes
      if (blindedBuffer.length !== keySize) {
        SafeLogger.warn('Blinded token size mismatch, normalizing', {
          actual: blindedBuffer.length,
          expected: keySize,
        });

        if (blindedBuffer.length > keySize) {
          // Truncate to key size (take last N bytes)
          blindedBuffer = blindedBuffer.subarray(
            blindedBuffer.length - keySize,
          );
        } else {
          // Pad with leading zeros
          const padding = Buffer.alloc(keySize - blindedBuffer.length, 0);
          blindedBuffer = Buffer.concat([padding, blindedBuffer]);
        }
      }

      // RSA-FDH: Sign the blinded token directly using raw RSA (no padding)
      // For blind signatures, we need raw RSA without padding
      // Use raw RSA signing: signature = blindedBuffer^d mod n
      const signature = await Promise.resolve(
        crypto.privateEncrypt(
          {
            key: this.privateKey,
            padding: crypto.constants.RSA_NO_PADDING,
          },
          blindedBuffer,
        ),
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

      // Get the key size to validate signature length
      const keySize =
        (publicKey.asymmetricKeyDetails?.modulusLength || 2048) / 8; // Convert bits to bytes

      SafeLogger.info('Blind token verification', {
        tokenLength: token.length,
        tokenBytes: tokenBuffer.length,
        signatureLength: signature.length,
        signatureBytes: signatureBuffer.length,
        expectedSignatureBytes: keySize,
        isValidLength: signatureBuffer.length === keySize,
      });

      // Ensure signature is exactly the key size (for RSA-2048, this is 256 bytes)
      if (signatureBuffer.length !== keySize) {
        SafeLogger.warn('Signature length mismatch', {
          actual: signatureBuffer.length,
          expected: keySize,
        });

        // If signature is larger, truncate to key size (take last N bytes)
        // If smaller, pad with leading zeros
        let normalizedSignature = signatureBuffer;
        if (signatureBuffer.length > keySize) {
          normalizedSignature = signatureBuffer.subarray(
            signatureBuffer.length - keySize,
          );
          SafeLogger.warn('Truncated signature to expected size', {
            original: signatureBuffer.length,
            truncated: normalizedSignature.length,
          });
        } else if (signatureBuffer.length < keySize) {
          const padding = Buffer.alloc(keySize - signatureBuffer.length, 0);
          normalizedSignature = Buffer.concat([padding, signatureBuffer]);
          SafeLogger.warn('Padded signature to expected size', {
            original: signatureBuffer.length,
            padded: normalizedSignature.length,
          });
        }

        // Use normalized signature for raw RSA verification
        let decryptedToken: Buffer;
        try {
          decryptedToken = crypto.publicDecrypt(
            {
              key: publicKey,
              padding: crypto.constants.RSA_NO_PADDING,
            },
            normalizedSignature,
          );
        } catch (error) {
          SafeLogger.error('Public decrypt failed during verification', error);
          return false;
        }

        // Normalize token buffer to key size for comparison
        let normalizedToken = tokenBuffer;
        if (normalizedToken.length < keySize) {
          const padding = Buffer.alloc(keySize - normalizedToken.length, 0);
          normalizedToken = Buffer.concat([padding, normalizedToken]);
        } else if (normalizedToken.length > keySize) {
          normalizedToken = normalizedToken.subarray(
            normalizedToken.length - keySize,
          );
        }

        const isValid = decryptedToken.equals(normalizedToken);
        SafeLogger.info('Raw RSA verification result (normalized)', {
          tokenLength: tokenBuffer.length,
          normalizedTokenLength: normalizedToken.length,
          decryptedLength: decryptedToken.length,
          isValid,
        });

        return isValid;
      }

      // Verify using raw RSA (no padding) for blind signatures
      // For RSA-FDH, we verify: tokenBuffer == signatureBuffer^e mod n
      // This is equivalent to: publicDecrypt(signature) == token
      let decryptedToken: Buffer;
      try {
        decryptedToken = crypto.publicDecrypt(
          {
            key: publicKey,
            padding: crypto.constants.RSA_NO_PADDING,
          },
          signatureBuffer,
        );
      } catch (error) {
        SafeLogger.error('Public decrypt failed during verification', error);
        return false;
      }

      // Normalize both buffers to the same length for comparison
      // Pad tokenBuffer with leading zeros if needed
      let normalizedToken = tokenBuffer;
      if (normalizedToken.length < keySize) {
        const padding = Buffer.alloc(keySize - normalizedToken.length, 0);
        normalizedToken = Buffer.concat([padding, normalizedToken]);
      } else if (normalizedToken.length > keySize) {
        normalizedToken = normalizedToken.subarray(
          normalizedToken.length - keySize,
        );
      }

      // Compare the decrypted signature with the original token
      const isValid = decryptedToken.equals(normalizedToken);

      SafeLogger.info('Raw RSA verification result', {
        tokenLength: tokenBuffer.length,
        normalizedTokenLength: normalizedToken.length,
        decryptedLength: decryptedToken.length,
        isValid,
      });

      return isValid;
    } catch (error) {
      SafeLogger.error('Blind token verification failed', error);
      return false;
    }
  }
}
