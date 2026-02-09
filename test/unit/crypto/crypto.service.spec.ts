import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../../src/crypto/crypto.service';
import { createMockConfigService } from '../../setup/mocks';
import { createMockBlindedToken } from '../../setup/test-helpers';
import * as crypto from 'crypto';

// Mock crypto module
jest.mock('crypto', () => ({
  createPrivateKey: jest.fn(),
  createPublicKey: jest.fn(),
  sign: jest.fn(),
  privateEncrypt: jest.fn(),
  publicDecrypt: jest.fn(),
  constants: {
    RSA_NO_PADDING: 4,
  },
}));

describe('CryptoService', () => {
  let service: CryptoService;
  let mockConfigService: ReturnType<typeof createMockConfigService>;
  const mockPrivateKey = {
    export: jest
      .fn()
      .mockReturnValue(
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
      ),
  };
  const mockPublicKey = {
    export: jest
      .fn()
      .mockReturnValue(
        '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
      ),
  };

  beforeEach(async () => {
    mockConfigService = createMockConfigService();
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'BLIND_SIGNING_PRIVATE_KEY') {
        return '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      }
      return undefined;
    });

    (crypto.createPrivateKey as jest.Mock).mockReturnValue(mockPrivateKey);
    (crypto.createPublicKey as jest.Mock).mockReturnValue(mockPublicKey);
    (crypto.sign as jest.Mock).mockReturnValue(Buffer.from('mock-signature'));
    (crypto.privateEncrypt as jest.Mock).mockReturnValue(
      Buffer.from('mock-signature'),
    );
    (crypto.publicDecrypt as jest.Mock).mockReturnValue(
      Buffer.from('decrypted-token'),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw Error if BLIND_SIGNING_PRIVATE_KEY is missing', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => new CryptoService(mockConfigService)).toThrow(
        'BLIND_SIGNING_PRIVATE_KEY is required',
      );
    });

    it('should throw Error if BLIND_SIGNING_PRIVATE_KEY is invalid', async () => {
      mockConfigService.get.mockReturnValue('invalid-key');
      (crypto.createPrivateKey as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid key');
      });

      expect(() => new CryptoService(mockConfigService)).toThrow(
        'Invalid BLIND_SIGNING_PRIVATE_KEY format',
      );
    });
  });

  describe('signBlindedToken', () => {
    it('should handle blinded token normalization (padding)', async () => {
      // Mock key size logic
      const shortToken = Buffer.alloc(32).toString('base64');

      await service.signBlindedToken(shortToken);

      const callArgs = (crypto.privateEncrypt as jest.Mock).mock.calls[0];
      const bufferArg = callArgs[1] as Buffer;
      expect(bufferArg.length).toBe(256);
    });

    it('should handle blinded token normalization (truncation)', async () => {
      const longToken = Buffer.alloc(300).toString('base64');

      await service.signBlindedToken(longToken);

      const callArgs = (crypto.privateEncrypt as jest.Mock).mock.calls[0];
      const bufferArg = callArgs[1] as Buffer;
      expect(bufferArg.length).toBe(256);
    });
    it('should successfully sign a valid blinded token', async () => {
      const blindedToken = createMockBlindedToken();

      const signature = await service.signBlindedToken(blindedToken);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(crypto.privateEncrypt).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid base64 format', async () => {
      const invalidToken = 'not-base64-format!!!';

      await expect(service.signBlindedToken(invalidToken)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for token that is too short', async () => {
      const shortToken = Buffer.from('short').toString('base64');

      await expect(service.signBlindedToken(shortToken)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for token that is too long', async () => {
      const longToken = Buffer.from('a'.repeat(5000)).toString('base64');

      await expect(service.signBlindedToken(longToken)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle crypto errors gracefully', async () => {
      const blindedToken = createMockBlindedToken();
      (crypto.privateEncrypt as jest.Mock).mockImplementation(() => {
        throw new Error('Crypto error');
      });

      await expect(service.signBlindedToken(blindedToken)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should not log token content (security check)', async () => {
      const blindedToken = createMockBlindedToken();
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      await service.signBlindedToken(blindedToken);

      // Verify that token content is not logged
      const logCalls = consoleSpy.mock.calls;
      const hasTokenInLogs = logCalls.some((call) =>
        JSON.stringify(call).includes(blindedToken),
      );
      expect(hasTokenInLogs).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('getPublicKey', () => {
    it('should return PEM formatted public key', () => {
      const publicKey = service.getPublicKey();

      expect(publicKey).toBeDefined();
      expect(publicKey).toContain('BEGIN PUBLIC KEY');
      expect(publicKey).toContain('END PUBLIC KEY');
      expect(crypto.createPublicKey).toHaveBeenCalled();
    });
  });

  describe('verifyBlindSignedToken', () => {
    it('should return true for valid signature', () => {
      const token = Buffer.from('original-token').toString('base64');
      const signature = Buffer.from('valid-signature').toString('base64');

      // Mock key size to match signature length (e.g. 15 bytes for 'valid-signature')
      const mockKeySize = 15;
      // mocking asymmetricKeyDetails locally for this test context is tricky because it's on the object created by createPublicKey
      // The current mock implementation in beforeEach returns a static object.
      // We need to adjust the mock mechanism to allow per-test behavior if we want to test lengths.
      // However, seeing the code: (publicKey.asymmetricKeyDetails?.modulusLength || 2048) / 8;
      // It defaults to 2048 bits / 8 = 256 bytes.

      // So 'valid-signature' (15 bytes) will trigger padding logic.
      // Normalized signature will be 256 bytes.

      // publicDecrypt should return the normalized token for it to be valid.
      // normalized token will be 256 bytes (padded 'original-token').

      const originalTokenBuffer = Buffer.from('original-token');
      const paddedToken = Buffer.alloc(256 - originalTokenBuffer.length, 0);
      const expectedDecrypted = Buffer.concat([
        paddedToken,
        originalTokenBuffer,
      ]);

      (crypto.publicDecrypt as jest.Mock).mockReturnValue(expectedDecrypted);

      const result = service.verifyBlindSignedToken(token, signature);

      expect(result).toBe(true);
      expect(crypto.publicDecrypt).toHaveBeenCalled();
    });

    it('should return false if publicDecrypt throws error', () => {
      const token = Buffer.from('token').toString('base64');
      const signature = Buffer.from('signature').toString('base64');

      (crypto.publicDecrypt as jest.Mock).mockImplementation(() => {
        throw new Error('Decrypt failed');
      });

      const result = service.verifyBlindSignedToken(token, signature);

      expect(result).toBe(false);
    });

    it('should return false if decrypted token does not match', () => {
      const token = Buffer.from('token').toString('base64');
      const signature = Buffer.from('signature').toString('base64');

      (crypto.publicDecrypt as jest.Mock).mockReturnValue(
        Buffer.from('wrong-content'),
      );

      const result = service.verifyBlindSignedToken(token, signature);

      expect(result).toBe(false);
    });

    it('should verify using raw RSA when signature length matches key size', () => {
      const token = Buffer.from('token').toString('base64');
      const signatureBuffer = Buffer.alloc(256, 1);
      const signature = signatureBuffer.toString('base64');

      const tokenBuffer = Buffer.from('token');
      const padding = Buffer.alloc(256 - tokenBuffer.length, 0);
      const expectedDecrypted = Buffer.concat([padding, tokenBuffer]);

      (crypto.publicDecrypt as jest.Mock).mockReturnValue(expectedDecrypted);

      const result = service.verifyBlindSignedToken(token, signature);

      expect(result).toBe(true);
      expect(crypto.publicDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({ padding: 4 }), // RSA_NO_PADDING
        signatureBuffer,
      );
    });

    it('should handle signature length mismatch by normalizing', () => {
      const token = Buffer.from('token').toString('base64');
      const longSignature = Buffer.from('a'.repeat(300)).toString('base64'); // > 256 bytes

      // It should truncate and then decrypt
      (crypto.publicDecrypt as jest.Mock).mockReturnValue(
        Buffer.from('decrypted'),
      );

      const result = service.verifyBlindSignedToken(token, longSignature);

      // We just verify it ran without throwing and called publicDecrypt
      expect(crypto.publicDecrypt).toHaveBeenCalled();
      expect(result).toBe(false); // Likely false because 'decrypted' != padded 'token'
    });
  });
});
