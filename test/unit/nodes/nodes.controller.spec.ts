import { Test, TestingModule } from '@nestjs/testing';
import { NodesController } from '../../../src/nodes/nodes.controller';
import { NodesService } from '../../../src/nodes/nodes.service';
import { ConfigService } from '@nestjs/config';
import { NodeAuthGuard } from '../../../src/auth/guards/node-auth.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('NodesController', () => {
  let controller: NodesController;
  let nodesService: NodesService;

  const mockNodesService = {
    register: jest.fn(),
    heartbeat: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_TOKEN') return 'test-token';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NodesController],
      providers: [
        {
          provide: NodesService,
          useValue: mockNodesService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        NodeAuthGuard,
      ],
    }).compile();

    controller = module.get<NodesController>(NodesController);
    nodesService = module.get<NodesService>(NodesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('NodeAuthGuard', () => {
    let guard: NodeAuthGuard;

    beforeEach(() => {
      guard = new NodeAuthGuard(mockConfigService as any);
    });

    it('should allow access with valid token', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer test-token',
            },
          }),
        }),
      } as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw UnauthorizedException with invalid token', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer wrong-token',
            },
          }),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with missing token', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should allow access when Bearer token matches any comma-separated NODE_TOKEN', () => {
      const multiConfig = {
        get: jest.fn((key: string) => {
          if (key === 'NODE_TOKEN') return 'first-token,second-token';
          return null;
        }),
      };
      const multiGuard = new NodeAuthGuard(multiConfig as any);
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer second-token',
            },
          }),
        }),
      } as ExecutionContext;

      expect(multiGuard.canActivate(context)).toBe(true);
    });

    it('should trim Bearer token and allow match when NODE_TOKEN has no trailing newline', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer test-token\n',
            },
          }),
        }),
      } as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('register', () => {
    it('should call nodesService.register', async () => {
      const dto = {
        publicKey: 'pubkey',
        region: 'us-east-1',
        status: 'ONLINE',
      };
      await controller.register(dto);
      expect(nodesService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('heartbeat', () => {
    it('should call nodesService.heartbeat', async () => {
      const dto = {
        publicKey: 'pubkey',
        metrics: { cpu_usage: 0.5, ram_usage: 0.5 },
      };
      await controller.heartbeat(dto);
      expect(nodesService.heartbeat).toHaveBeenCalledWith(dto);
    });
  });
});
