import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import Stripe from 'stripe';
import { SafeLogger } from '../../common/utils/logger.util';

@Controller('payment/stripe')
export class StripeWebhookController {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(
    private stripeService: StripeService,
    private configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    ) || '';

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia',
    });
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const sig = req.headers['stripe-signature'];

    if (!sig || !this.webhookSecret) {
      SafeLogger.error('Missing Stripe webhook signature or secret');
      return res.status(400).send('Missing signature or secret');
    }

    let event: Stripe.Event;

    try {
      // Get raw body from request (set by NestJS rawBody option)
      const rawBody = (req as any).rawBody || req.body;
      
      // Verify webhook signature using raw body
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        sig,
        this.webhookSecret,
      );
    } catch (err) {
      SafeLogger.error('Stripe webhook signature verification failed', err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      await this.stripeService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (error) {
      SafeLogger.error('Error handling Stripe webhook', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  }

  @Post('checkout')
  async createCheckout(@Req() req: Request) {
    const { userId, planId, successUrl, cancelUrl } = req.body;

    if (!userId || !planId) {
      return { error: 'userId and planId are required' };
    }

    const session = await this.stripeService.createCheckoutSession(
      userId,
      planId,
      successUrl || 'https://vpnkeen.com/success',
      cancelUrl || 'https://vpnkeen.com/cancel',
    );

    return { url: session.url, sessionId: session.id };
  }

  @Post('portal')
  async createPortal(@Req() req: Request) {
    const { customerId, returnUrl } = req.body;

    if (!customerId || !returnUrl) {
      return { error: 'customerId and returnUrl are required' };
    }

    const session = await this.stripeService.createCustomerPortalSession(
      customerId,
      returnUrl,
    );

    return { url: session.url };
  }
}

