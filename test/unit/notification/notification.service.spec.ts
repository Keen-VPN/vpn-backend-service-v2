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

  describe('notifyTrialStarted', () => {
    it('posts to SLACK_TRIAL_WEBHOOK_URL when configured in production', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'SLACK_TRIAL_WEBHOOK_URL')
          return 'https://hooks.slack.com/trial-test';
        return undefined;
      });

      mockHttpService.post.mockReturnValue(
        of({
          data: 'ok',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as AxiosResponse['config'],
        }),
      );

      const ok = await service.notifyTrialStarted({
        userId: 'user-uuid',
        userEmail: 'a@example.com',
        billingChannel: 'stripe',
        planLabel: 'Monthly trial',
        occurredAt: new Date('2026-04-21T12:00:00.000Z'),
      });

      expect(ok).toBe(true);
      const postedText = mockHttpService.post.mock.calls[0][1].text as string;
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/trial-test',
        expect.objectContaining({
          text: expect.stringContaining('a@example.com') as string,
        }),
      );
      expect(postedText).toContain('New Free Trial Started');
      expect(postedText).toContain('*Signup Method:* Stripe');
      expect(postedText).toContain('Monthly (Trial)');
    });

    it('returns false when SLACK_TRIAL_WEBHOOK_URL is missing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      const ok = await service.notifyTrialStarted({
        userId: 'user-uuid',
        userEmail: 'a@example.com',
        billingChannel: 'apple',
        planLabel: 'Annual trial',
        occurredAt: new Date(),
      });

      expect(ok).toBe(false);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('returns false outside production (e.g. staging)', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'staging';
        if (key === 'SLACK_TRIAL_WEBHOOK_URL')
          return 'https://hooks.slack.com/trial-test';
        return undefined;
      });

      const ok = await service.notifyTrialStarted({
        userId: 'user-uuid',
        userEmail: 'a@example.com',
        billingChannel: 'stripe',
        planLabel: 'Monthly trial',
        occurredAt: new Date(),
      });

      expect(ok).toBe(false);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('returns false in development', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'SLACK_TRIAL_WEBHOOK_URL')
          return 'https://hooks.slack.com/trial-test';
        return undefined;
      });

      const ok = await service.notifyTrialStarted({
        userId: 'user-uuid',
        userEmail: 'a@example.com',
        billingChannel: 'apple',
        planLabel: 'Annual trial',
        occurredAt: new Date(),
      });

      expect(ok).toBe(false);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('notifyPaidConversion', () => {
    it('posts to SLACK_TRIAL_WEBHOOK_URL in production', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'SLACK_TRIAL_WEBHOOK_URL')
          return 'https://hooks.slack.com/trial-test';
        return undefined;
      });

      mockHttpService.post.mockReturnValue(
        of({
          data: 'ok',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as AxiosResponse['config'],
        }),
      );

      const ok = await service.notifyPaidConversion({
        userId: 'u1',
        userEmail: 'a@example.com',
        paymentSource: 'stripe',
        planDisplay: 'Annual',
        conversionType: 'trial_to_paid',
        occurredAt: new Date('2026-04-16T16:10:00.000Z'),
      });

      expect(ok).toBe(true);
      const text = mockHttpService.post.mock.calls[0][1].text as string;
      expect(text).toContain('Trial Converted to Paid');
      expect(text).toContain('*Source:* Stripe');
      expect(text).toContain('*Plan:* Annual');
      expect(text).toContain('Trial → Paid');
    });

    it('returns false outside production', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'SLACK_TRIAL_WEBHOOK_URL')
          return 'https://hooks.slack.com/trial-test';
        return undefined;
      });

      const ok = await service.notifyPaidConversion({
        userId: 'u1',
        userEmail: 'a@example.com',
        paymentSource: 'apple',
        planDisplay: 'Monthly',
        conversionType: 'new_paid',
        occurredAt: new Date(),
      });

      expect(ok).toBe(false);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('notifyServerLocationRequest', () => {
    it('should send server location request to dedicated Slack webhook', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'SLACK_SERVER_REQUESTS_WEBHOOK_URL')
          return 'https://hooks.slack.com/server-requests';
        return undefined;
      });

      const mockResponse: AxiosResponse = {
        data: 'ok',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as AxiosResponse['config'],
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));

      await service.notifyServerLocationRequest({
        region: 'Netherlands',
        reason: 'High-speed streaming and privacy laws',
        createdAt: '2026-04-10T14:30:00.000Z',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/server-requests',
        expect.objectContaining({
          text: expect.stringContaining('Netherlands') as string,
        }),
      );
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String) as string,
        expect.objectContaining({
          text: expect.stringContaining(
            'High-speed streaming and privacy laws',
          ) as string,
        }),
      );
    });

    it('should skip and log an error when SLACK_SERVER_REQUESTS_WEBHOOK_URL is not configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      });

      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => {});

      await service.notifyServerLocationRequest({
        region: 'Germany',
        reason: 'EU compliance',
        createdAt: '2026-04-10T14:30:00.000Z',
      });

      expect(mockHttpService.post).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'SLACK_SERVER_REQUESTS_WEBHOOK_URL not configured',
        ),
      );
    });

    it('should skip in development environment', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'SLACK_SERVER_REQUESTS_WEBHOOK_URL')
          return 'https://hooks.slack.com/server-requests';
        return undefined;
      });

      await service.notifyServerLocationRequest({
        region: 'Japan',
        reason: 'Low latency',
        createdAt: '2026-04-10T14:30:00.000Z',
      });

      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should not throw when Slack call fails', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'SLACK_SERVER_REQUESTS_WEBHOOK_URL')
          return 'https://hooks.slack.com/server-requests';
        return undefined;
      });

      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(
        service.notifyServerLocationRequest({
          region: 'Brazil',
          reason: 'Closer servers',
          createdAt: '2026-04-10T14:30:00.000Z',
        }),
      ).resolves.not.toThrow();
    });

    it('should strip Slack mrkdwn control characters from region and reason', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'SLACK_SERVER_REQUESTS_WEBHOOK_URL')
          return 'https://hooks.slack.com/server-requests';
        return undefined;
      });

      const mockResponse: AxiosResponse = {
        data: 'ok',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as AxiosResponse['config'],
      };
      mockHttpService.post.mockReturnValue(of(mockResponse));

      await service.notifyServerLocationRequest({
        region: '*bold injection*',
        reason: '<https://evil.com|Click here> and `code` and ~strike~',
        createdAt: '2026-04-10T14:30:00.000Z',
      });

      const postedText: string = mockHttpService.post.mock.calls[0][1].text;

      // Extract just the Country and Reason lines so we only inspect the
      // user-supplied values, not the intentional mrkdwn in the static headers.
      const lines = postedText.split('\n');
      const countryLine = lines.find((l) => l.startsWith('*Country:*')) ?? '';
      const reasonLine = lines.find((l) => l.startsWith('*Reason:*')) ?? '';
      const countryValue = countryLine.replace('*Country:*', '').trim();
      const reasonValue = reasonLine.replace('*Reason:*', '').trim();

      // mrkdwn control characters must be stripped from the user-supplied values
      expect(countryValue).not.toMatch(/[*_~`<>|]/);
      expect(reasonValue).not.toMatch(/[*_~`<>|]/);

      // Legitimate plain-text content is preserved
      expect(countryValue).toContain('bold injection');
      expect(reasonValue).toContain('Click here');
      expect(reasonValue).toContain('code');
      expect(reasonValue).toContain('strike');
    });
  });
});
