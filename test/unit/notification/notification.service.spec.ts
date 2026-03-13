import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import {
  NotificationService,
  AlertType,
} from '../../../src/notification/notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  const mockHttpService = {
    post: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);

    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'SLACK_WEBHOOK_URL') return 'https://hooks.slack.com/test';
      return undefined;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendSlackAlert', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should send alert to Slack webhook', async () => {
      const alert = {
        type: AlertType.HIGH_LOAD,
        severity: 'warning' as const,
        message: 'Test alert',
        metadata: { test: 'data' },
      };

      const mockResponse: AxiosResponse = {
        data: 'ok',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as AxiosResponse['config'],
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await service.sendSlackAlert(alert);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('Test alert') as string,
        }),
      );
    });

    it('should format message with emoji based on severity', async () => {
      const criticalAlert = {
        type: AlertType.NODE_DEATH,
        severity: 'critical' as const,
        message: 'Node down',
      };

      mockHttpService.post.mockReturnValue(
        of({
          data: 'ok',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as AxiosResponse['config'],
        }),
      );

      await service.sendSlackAlert(criticalAlert);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String) as string,
        expect.objectContaining({
          text: expect.stringContaining('🔴') as string,
        }),
      );
    });

    it('should not throw error if Slack call fails', async () => {
      const alert = {
        type: AlertType.SYSTEM_ERROR,
        severity: 'critical' as const,
        message: 'Test',
      };

      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(service.sendSlackAlert(alert)).resolves.not.toThrow();
    });

    it('should skip sending if no webhook URL configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'SLACK_WEBHOOK_URL') return undefined;
        return undefined;
      });

      const alert = {
        type: AlertType.HIGH_LOAD,
        severity: 'warning' as const,
        message: 'Test',
      };

      await service.sendSlackAlert(alert);

      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should not send to Slack when NODE_ENV is development', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'SLACK_WEBHOOK_URL') return 'https://hooks.slack.com/test';
        return undefined;
      });

      const alert = {
        type: AlertType.HIGH_LOAD,
        severity: 'warning' as const,
        message: 'Test',
      };

      await service.sendSlackAlert(alert);

      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('notifyHighLoad', () => {
    it('should send high load alert with correct format', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: 'ok',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as AxiosResponse['config'],
        }),
      );

      await service.notifyHighLoad('node-123', 95.5, 90);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String) as string,
        expect.objectContaining({
          text: expect.stringContaining('node-123') as string,
        }),
      );
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String) as string,
        expect.objectContaining({
          text: expect.stringContaining('95.5') as string,
        }),
      );
    });
  });

  describe('notifyNodeDeath', () => {
    it('should send node death alert', async () => {
      const lastHeartbeat = new Date('2026-01-09T10:00:00Z');

      mockHttpService.post.mockReturnValue(
        of({
          data: 'ok',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as AxiosResponse['config'],
        }),
      );

      await service.notifyNodeDeath('node-456', lastHeartbeat);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String) as string,
        expect.objectContaining({
          text: expect.stringContaining('node-456') as string,
        }),
      );
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String) as string,
        expect.objectContaining({
          text: expect.stringContaining('🔴') as string,
        }),
      );
    });
  });

  describe('reportErrorToSlack', () => {
    it('should not send to Slack when NODE_ENV is development', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'SLACK_WEBHOOK_URL') return 'https://hooks.slack.com/test';
        return undefined;
      });

      const mockRequest = {
        method: 'GET',
        url: '/test',
      } as any;

      await service.reportErrorToSlack(
        new Error('Test error'),
        mockRequest,
        500,
        'req-123',
      );

      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('notifyNodeRegistered', () => {
    it('should send node registration alert', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: 'ok',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as AxiosResponse['config'],
        }),
      );

      await service.notifyNodeRegistered('node-789', 'us-east');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String) as string,
        expect.objectContaining({
          text: expect.stringContaining('node-789') as string,
        }),
      );
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String) as string,
        expect.objectContaining({
          text: expect.stringContaining('us-east') as string,
        }),
      );
    });
  });
});
