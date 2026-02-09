import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createMockPrismaClient } from '../../setup/mocks';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerPushToken', () => {
    it('should upsert push token with all fields', async () => {
      const userId = 'user-1';
      const token = 'token-123';
      const deviceHash = 'hash-1';
      const platform = 'ios';
      const environment = 'production';

      prisma.pushToken.upsert.mockResolvedValue({ id: '1', token } as any);

      const result = await service.registerPushToken(
        userId,
        token,
        deviceHash,
        platform,
        environment,
      );

      expect(result).toEqual({ success: true });
      expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
        where: { token },
        create: {
          userId,
          token,
          deviceHash,
          platform,
          environment,
        },
        update: {
          userId,
          deviceHash,
          platform,
          environment,
        },
      });
    });

    it('should upsert push token with missing optional fields', async () => {
      const userId = 'user-1';
      const token = 'token-123';
      // Missing deviceHash, platform, environment

      prisma.pushToken.upsert.mockResolvedValue({ id: '1', token } as any);

      const result = await service.registerPushToken(userId, token);

      expect(result).toEqual({ success: true });
      expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
        where: { token },
        create: {
          userId,
          token,
          deviceHash: null,
          platform: null,
          environment: null,
        },
        update: {
          userId,
          deviceHash: undefined,
          platform: undefined,
          environment: undefined,
        },
      });
    });
  });
});
