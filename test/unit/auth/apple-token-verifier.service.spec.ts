import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AppleTokenVerifierService } from '../../../src/auth/apple-token-verifier.service';
import { ConfigService } from '@nestjs/config';
import { createMockConfigService } from '../../setup/mocks';

// Mock jwks-rsa
const mockGetSigningKey = jest.fn((kid, callback) => {
  callback(null, {
    getPublicKey: jest.fn(() => 'mock-public-key'),
  });
});

jest.mock('jwks-rsa', () => {
  const mockJwksClient = jest.fn(() => ({
    getSigningKey: mockGetSigningKey,
  }));
  return {
    __esModule: true,
    default: mockJwksClient,
  };
});

// Mock jsonwebtoken
const mockJwtDecode = jest.fn();
const mockJwtVerify = jest.fn();

jest.mock('jsonwebtoken', () => ({
  decode: (...args: any[]) => mockJwtDecode(...args),
  verify: (...args: any[]) => mockJwtVerify(...args),
}));

describe('AppleTokenVerifierService', () => {
  let service: AppleTokenVerifierService;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService();
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'APPLE_BUNDLE_ID') {
        return 'com.keenvpn.KeenVPN.keenVPN';
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleTokenVerifierService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AppleTokenVerifierService>(AppleTokenVerifierService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyIdentityToken', () => {
    it('should verify valid Apple identity token', async () => {
      const payload = {
        iss: 'https://appleid.apple.com',
        aud: 'com.keenvpn.KeenVPN.keenVPN',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        sub: 'user_123',
        email: 'test@example.com',
        email_verified: true,
      };

      const mockToken = 'mock.token.here';
      mockJwtDecode.mockReturnValue({
        header: { kid: 'key_id_123', alg: 'RS256' },
        payload,
      });
      mockJwtVerify.mockReturnValue(payload);

      const result = await service.verifyIdentityToken(mockToken);

      expect(result.iss).toBe('https://appleid.apple.com');
      expect(result.sub).toBe('user_123');
      expect(result.email).toBe('test@example.com');
    });

    it('should throw UnauthorizedException for invalid token format', async () => {
      mockJwtDecode.mockReturnValue(null);

      await expect(
        service.verifyIdentityToken('invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for token missing key ID', async () => {
      mockJwtDecode.mockReturnValue({
        header: {},
        payload: {},
      });

      await expect(
        service.verifyIdentityToken('token-without-kid'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle audience mismatch with flexible verification', async () => {
      const payload = {
        iss: 'https://appleid.apple.com',
        aud: 'different.bundle.id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        sub: 'user_123',
      };

      const mockToken = 'mock.token.here';
      mockJwtDecode
        .mockReturnValueOnce({
          header: { kid: 'key_id_123', alg: 'RS256' },
          payload,
        })
        .mockReturnValueOnce({
          header: { kid: 'key_id_123', alg: 'RS256' },
          payload,
        });

      // First verify call fails with audience error
      mockJwtVerify
        .mockImplementationOnce(() => {
          const error = new Error('jwt audience invalid');
          (error as any).message = 'jwt audience invalid';
          throw error;
        })
        .mockImplementationOnce(() => payload);

      const result = await service.verifyIdentityToken(mockToken);

      expect(result.iss).toBe('https://appleid.apple.com');
      expect(result.sub).toBe('user_123');
    });

    it('should throw UnauthorizedException for invalid issuer', async () => {
      const payload = {
        iss: 'https://invalid.issuer.com',
        aud: 'com.keenvpn.KeenVPN.keenVPN',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        sub: 'user_123',
      };

      const mockToken = 'mock.token.here';
      mockJwtDecode.mockReturnValue({
        header: { kid: 'key_id_123', alg: 'RS256' },
        payload,
      });
      mockJwtVerify.mockReturnValue(payload);

      await expect(
        service.verifyIdentityToken(mockToken),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
