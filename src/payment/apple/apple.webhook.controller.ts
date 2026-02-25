import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Body,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppleService } from './apple.service';
import { SafeLogger } from '../../common/utils/logger.util';

import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('Apple Webhook')
@Controller('payment/apple')
export class AppleWebhookController {
  constructor(@Inject(AppleService) private appleService: AppleService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Apple server-to-server notifications' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 500, description: 'Webhook handler failed' })
  @ApiBody({
    description: 'Apple V2 Server Notification payload (signedPayload)',
    schema: {
      type: 'object',
      properties: {
        signedPayload: {
          type: 'string',
          description: 'A JSON Web Signature (JWS) string',
          example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjZm...',
        },
      },
    },
  })
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      const event = req.body as Record<string, any>;

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
  @ApiOperation({ summary: 'Verify Apple receipt' })
  @ApiResponse({ status: 200, description: 'Receipt verification result' })
  @ApiBody({
    schema: { type: 'object', properties: { receiptData: { type: 'string' } } },
  })
  async verifyReceipt(@Req() req: Request) {
    const body = req.body as { receiptData: string };
    const { receiptData } = body;

    if (!receiptData) {
      return { error: 'receiptData is required' };
    }

    const result: unknown = await this.appleService.verifyReceipt(receiptData);
    return result as Record<string, unknown>; // Explicit cast or cleaner return
  }
}
