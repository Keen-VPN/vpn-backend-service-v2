import { Test, TestingModule } from '@nestjs/testing';
import { RedemptionController } from '../../../src/redemption/redemption.controller';
import { RedemptionService } from '../../../src/redemption/redemption.service';
import { RedeemTokenDto } from '../../../src/redemption/dto/redeem-token.dto';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('RedemptionController', () => {
  let controller: RedemptionController;
  let mockRedemptionService: any;

  beforeEach(async () => {
    mockRedemptionService = {
      redeemToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedemptionController],
      providers: [
        {
          provide: RedemptionService,
          useValue: mockRedemptionService,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<RedemptionController>(RedemptionController);
  });

  describe('redeemToken', () => {
    it('should call service with correct params', async () => {
      const dto: RedeemTokenDto = {
        token: 'token',
        signature: 'signature',
        serverId: 'server-1',
      };
      const credentials = { username: 'u', password: 'p' };

      mockRedemptionService.redeemToken.mockResolvedValue(credentials);

      const result = await controller.redeemToken(dto);

      expect(mockRedemptionService.redeemToken).toHaveBeenCalledWith(dto);
      expect(result).toEqual(credentials);
    });
  });
});
