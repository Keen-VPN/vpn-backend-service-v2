import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { CryptoController } from '../../../src/crypto/crypto.controller';
import { CryptoService } from '../../../src/crypto/crypto.service';
import { FirebaseAuthGuard } from '../../../src/auth/guards/firebase-auth.guard';
import { createMockBlindedToken } from '../../setup/test-helpers';

import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { SessionAuthGuard } from '../../../src/auth/guards/session-auth.guard';

describe('CryptoController', () => {
  let controller: CryptoController;
  let cryptoService: jest.Mocked<CryptoService>;
  let subscriptionService: jest.Mocked<SubscriptionService>;

  beforeEach(async () => {
    const mockCryptoService = {
      signBlindedToken: jest.fn(),
      getPublicKey: jest.fn(),
    };

    const mockSubscriptionService = {
      getStatusWithSession: jest.fn().mockResolvedValue({ hasActiveSubscription: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CryptoController],
      providers: [
        {
          provide: CryptoService,
          useValue: mockCryptoService,
        },
        {
          provide: SubscriptionService,
          useValue: mockSubscriptionService,
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<CryptoController>(CryptoController);
    cryptoService = module.get(CryptoService);
    subscriptionService = module.get(SubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/vpn-token', () => {
    it('should successfully sign blinded token', async () => {
      const blindedToken = createMockBlindedToken();
      const signature = 'mock-signature-base64';
      const user = { uid: 'firebase-uid-123' };

      cryptoService.signBlindedToken.mockResolvedValue(signature);

      const mockReq = {
        headers: { authorization: 'Bearer valid-token' },
        body: {},
      } as any;

      cryptoService.signBlindedToken.mockResolvedValue(signature);

      const result = await controller.signBlindedToken(
        mockReq,
        { blindedToken },
      );

      expect(result.signature).toBe(signature);
      expect(cryptoService.signBlindedToken).toHaveBeenCalledWith(blindedToken);
    });

    it('should throw BadRequestException for invalid token format', async () => {
      const invalidToken = 'not-base64';

      const mockReq = {
        headers: { authorization: 'Bearer valid-token' },
        body: {},
      } as any;

      cryptoService.signBlindedToken.mockRejectedValue(
        new BadRequestException('Invalid blinded token length'),
      );

      await expect(
        controller.signBlindedToken(mockReq, { blindedToken: invalidToken }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /auth/vpn-token/public-key', () => {
    it('should return public key', async () => {
      const publicKey = '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----';

      cryptoService.getPublicKey.mockReturnValue(publicKey);

      const result = controller.getPublicKey();

      expect(result.publicKey).toBe(publicKey);
      expect(cryptoService.getPublicKey).toHaveBeenCalled();
    });
  });
});

