import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../src/auth/auth.service';
import { FirebaseConfig } from '../../../src/config/firebase.config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  createMockFirebaseAuth,
  createMockPrismaClient,
  MockPrismaClient,
} from '../../setup/mocks';
import {
  createMockUser,
  createMockSubscription,
  createMockDecodedFirebaseToken,
} from '../../setup/test-helpers';

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: MockPrismaClient;
  let mockFirebaseAuth: ReturnType<typeof createMockFirebaseAuth>;
  let mockFirebaseConfig: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaClient();
    mockFirebaseAuth = createMockFirebaseAuth();
    mockFirebaseConfig = {
      getAuth: jest.fn().mockReturnValue(mockFirebaseAuth),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: FirebaseConfig,
          useValue: mockFirebaseConfig,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should successfully login with valid Firebase token and sync user', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const user = createMockUser({ firebaseUid: decodedToken.uid });
      const subscription = createMockSubscription({ userId: user.id });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.subscription.findFirst.mockResolvedValue(subscription);

      const result = await service.login(idToken);

      expect(result.user.id).toBe(user.id);
      expect(result.user.email).toBe(user.email);
      expect(result.subscription).toBeDefined();
      expect(mockFirebaseAuth.verifyIdToken).toHaveBeenCalledWith(idToken);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { firebaseUid: decodedToken.uid },
      });
    });

    it('should create new user if not found', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const newUser = createMockUser({ firebaseUid: decodedToken.uid });

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(newUser);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.login(idToken);

      expect(result.user.id).toBe(newUser.id);
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).toHaveBeenCalled();
    });

    it('should update existing user info', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      const existingUser = createMockUser({ firebaseUid: decodedToken.uid });
      const updatedUser = { ...existingUser, email: decodedToken.email };

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.login(idToken);

      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(result.user.email).toBe(decodedToken.email);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const idToken = 'invalid-token';

      mockFirebaseAuth.verifyIdToken.mockRejectedValue(
        new Error('Invalid token'),
      );

      await expect(service.login(idToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockFirebaseAuth.verifyIdToken).toHaveBeenCalledWith(idToken);
    });

    it('should throw UnauthorizedException if email is missing', async () => {
      const idToken = 'valid-firebase-token';
      const decodedToken = createMockDecodedFirebaseToken();
      delete decodedToken.email;

      mockFirebaseAuth.verifyIdToken.mockResolvedValue(decodedToken as any);

      await expect(service.login(idToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should perform server-side cleanup', async () => {
      const userId = 'user-123';

      const result = await service.logout(userId);

      expect(result.success).toBe(true);
    });
  });
});

