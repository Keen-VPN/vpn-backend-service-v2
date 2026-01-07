import { Test, TestingModule } from '@nestjs/testing';
import { AppleWebhookController } from '../../../src/payment/apple/apple.webhook.controller';
import { AppleService } from '../../../src/payment/apple/apple.service';
import { createMockAppleReceipt } from '../../setup/test-helpers';

describe('AppleWebhookController', () => {
  let controller: AppleWebhookController;
  let appleService: jest.Mocked<AppleService>;

  beforeEach(async () => {
    const mockAppleService = {
      handleWebhookEvent: jest.fn(),
      verifyReceipt: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppleWebhookController],
      providers: [
        {
          provide: AppleService,
          useValue: mockAppleService,
        },
      ],
    }).compile();

    controller = module.get<AppleWebhookController>(AppleWebhookController);
    appleService = module.get(AppleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /payment/apple/webhook', () => {
    it('should process webhook event', async () => {
      const event = {
        notification_type: 'DID_RENEW',
        unified_receipt: {},
      };
      const mockReq = { body: event };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      appleService.handleWebhookEvent.mockResolvedValue(undefined);

      await controller.handleWebhook(mockReq as any, mockRes as any);

      expect(appleService.handleWebhookEvent).toHaveBeenCalledWith(event);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe('POST /payment/apple/receipt', () => {
    it('should verify receipt', async () => {
      const receiptData = 'base64-receipt-data';
      const receiptResult = createMockAppleReceipt();
      const mockReq = { body: { receiptData } };

      appleService.verifyReceipt.mockResolvedValue(receiptResult);

      const result = await controller.verifyReceipt(mockReq as any);

      expect(result.status).toBe(0);
      expect(appleService.verifyReceipt).toHaveBeenCalledWith(receiptData);
    });

    it('should return error if receiptData is missing', async () => {
      const mockReq = { body: {} };

      const result = await controller.verifyReceipt(mockReq as any);

      expect(result.error).toBe('receiptData is required');
    });
  });
});

