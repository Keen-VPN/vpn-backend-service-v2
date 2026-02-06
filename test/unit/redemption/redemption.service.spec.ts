import { Test, TestingModule } from '@nestjs/testing';
import { RedemptionService } from '../../../src/redemption/redemption.service';
import { CryptoService } from '../../../src/auth/crypto/crypto.service';
import { VPNConfigService } from '../../../src/config/vpn-config.service';
import { RedisService } from '../../../src/redis/redis.service';
import { BadRequestException } from '@nestjs/common';
import { RedeemTokenDto } from '../../../src/redemption/dto/redeem-token.dto';

describe('RedemptionService', () => {
  let service: RedemptionService;
  let mockCryptoService: any;
  let mockVPNConfigService: any;
  let mockRedisService: any;

  beforeEach(async () => {
    mockCryptoService = {
      verifyBlindSignedToken: jest.fn(),
    };
    mockVPNConfigService = {
      generateTokenBasedCredentials: jest.fn(),
    };
    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedemptionService,
        {
          provide: CryptoService,
          useValue: mockCryptoService,
        },
        {
          provide: VPNConfigService,
          useValue: mockVPNConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<RedemptionService>(RedemptionService);
  });

  describe('redeemToken', () => {
    it('should successfully redeem a valid token', async () => {
      const dto: RedeemTokenDto = {
        token: 'valid-token',
        signature: 'valid-signature',
        serverId: 'us-east-1',
      };
      const credentials = { username: 'user', password: 'password' };

      mockCryptoService.verifyBlindSignedToken.mockReturnValue(true);
      mockRedisService.get.mockResolvedValue(null);
      mockVPNConfigService.generateTokenBasedCredentials.mockResolvedValue(
        credentials,
      );

      const result = await service.redeemToken(dto);

      expect(mockCryptoService.verifyBlindSignedToken).toHaveBeenCalledWith(
        dto.token,
        dto.signature,
      );
      expect(mockRedisService.get).toHaveBeenCalledWith(
        `spent_token:${dto.token}`,
      );
      expect(mockRedisService.set).toHaveBeenCalled();
      expect(
        mockVPNConfigService.generateTokenBasedCredentials,
      ).toHaveBeenCalledWith(dto.token, dto.signature, dto.serverId);
      expect(result).toEqual(credentials);
    });

    it('should throw BadRequestException for invalid signature', async () => {
      const dto: RedeemTokenDto = {
        token: 'invalid-token',
        signature: 'invalid-signature',
        serverId: 'us-east-1',
      };

      mockCryptoService.verifyBlindSignedToken.mockReturnValue(false);

      await expect(service.redeemToken(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRedisService.get).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for double spending', async () => {
      const dto: RedeemTokenDto = {
        token: 'spent-token',
        signature: 'valid-signature',
        serverId: 'us-east-1',
      };

      mockCryptoService.verifyBlindSignedToken.mockReturnValue(true);
      mockRedisService.get.mockResolvedValue('redeemed');

      await expect(service.redeemToken(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(
        mockVPNConfigService.generateTokenBasedCredentials,
      ).not.toHaveBeenCalled();
    });
  });
});
