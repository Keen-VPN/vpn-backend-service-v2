import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppleService } from './apple.service';
import { SafeLogger } from '../../common/utils/logger.util';

@Controller('payment/apple')
export class AppleWebhookController {
  constructor(private appleService: AppleService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      const event = req.body;

      // Verify JWT signature (Apple Server-to-Server notifications use JWT)
      // In production, verify the JWT signature using Apple's public keys
      // For now, we'll process the event (add JWT verification in production)

      await this.appleService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (error) {
      SafeLogger.error('Error handling Apple webhook', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  }

  @Post('receipt')
  @HttpCode(HttpStatus.OK)
  async verifyReceipt(@Req() req: Request) {
    const { receiptData } = req.body;

    if (!receiptData) {
      return { error: 'receiptData is required' };
    }

    const result = await this.appleService.verifyReceipt(receiptData);
    return result;
  }
}
