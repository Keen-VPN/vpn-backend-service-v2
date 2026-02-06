import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../../../src/auth/crypto/crypto.service';
import { createMockConfigService } from '../../../setup/mocks';
import { createMockBlindedToken } from '../../../setup/test-helpers';
import * as crypto from 'crypto';

// Mock crypto module
jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  return {
    ...actualCrypto,
    createPrivateKey: jest.fn(),
    createPublicKey: jest.fn(),
    privateEncrypt: jest.fn(),
    publicDecrypt: jest.fn(),
    sign: jest.fn(),
  };
});

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
    (crypto.privateEncrypt as jest.Mock).mockReturnValue(
      Buffer.from('mock-signature'),
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

  describe('signBlindedToken', () => {
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
});
