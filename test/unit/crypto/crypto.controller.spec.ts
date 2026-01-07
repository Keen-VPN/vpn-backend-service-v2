import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { CryptoController } from '../../../src/crypto/crypto.controller';
import { CryptoService } from '../../../src/crypto/crypto.service';
import { FirebaseAuthGuard } from '../../../src/auth/guards/firebase-auth.guard';
import { createMockBlindedToken } from '../../setup/test-helpers';

describe('CryptoController', () => {
  let controller: CryptoController;
  let cryptoService: jest.Mocked<CryptoService>;

  beforeEach(async () => {
    const mockCryptoService = {
      signBlindedToken: jest.fn(),
      getPublicKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CryptoController],
      providers: [
        {
          provide: CryptoService,
          useValue: mockCryptoService,
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<CryptoController>(CryptoController);
    cryptoService = module.get(CryptoService);
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

      const result = await controller.signBlindedToken(
        { blindedToken },
        user as any,
      );

      expect(result.signature).toBe(signature);
      expect(cryptoService.signBlindedToken).toHaveBeenCalledWith(blindedToken);
    });

    it('should throw BadRequestException for invalid token format', async () => {
      const invalidToken = 'not-base64';

      cryptoService.signBlindedToken.mockRejectedValue(
        new BadRequestException('Invalid blinded token length'),
      );

      await expect(
        controller.signBlindedToken({ blindedToken: invalidToken }, {} as any),
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

