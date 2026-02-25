import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import Stripe from 'stripe';
import { SafeLogger } from '../../common/utils/logger.util';
import { FirebaseAuthGuard } from '../../auth/guards/firebase-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  StripeCheckoutResponseDto,
  StripePortalResponseDto,
} from '../../common/dto/response/stripe.response.dto';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Stripe')
@Controller('payment/stripe')
export class StripeWebhookController {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(
    @Inject(StripeService) private stripeService: StripeService,
    @Inject(ConfigService) private configService: ConfigService,
  ) {
    const secretKey =
      this.configService?.get<string>('STRIPE_SECRET_KEY') ||
      process.env.STRIPE_SECRET_KEY;
    this.webhookSecret =
      this.configService?.get<string>('STRIPE_WEBHOOK_SECRET') ||
      process.env.STRIPE_WEBHOOK_SECRET ||
      '';

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
    });
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Missing signature or secret' })
  @ApiResponse({ status: 500, description: 'Webhook handler failed' })
  @ApiBody({
    description: 'Stripe webhook event object',
    schema: { type: 'object' },
  })
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const sig = req.headers['stripe-signature'];

    if (!sig || !this.webhookSecret) {
      SafeLogger.error('Missing Stripe webhook signature or secret');
      return res.status(400).send('Missing signature or secret');
    }

    let event: Stripe.Event;

    try {
      // Get raw body from request (set by NestJS rawBody option)
      // Get raw body from request (set by NestJS rawBody option)
      const reqWithRawBody = req as Request & { rawBody?: Buffer };
      const rawBody = reqWithRawBody.rawBody || (req.body as Buffer);

      // Verify webhook signature using raw body
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        sig,
        this.webhookSecret,
      );
    } catch (err) {
      SafeLogger.error('Stripe webhook signature verification failed', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return res.status(400).send(`Webhook Error: ${errorMessage}`);
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
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  @ApiResponse({
    status: 201,
    description: 'Checkout session created',
    type: StripeCheckoutResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Missing required fields' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        successUrl: { type: 'string' },
        cancelUrl: { type: 'string' },
      },
    },
  })
  async createCheckout(
    @Req() req: Request,
    @CurrentUser() user: { uid: string },
  ) {
    const { planId, successUrl, cancelUrl } = req.body as {
      planId: string;
      successUrl?: string;
      cancelUrl?: string;
    };
    const userId = user.uid;

    if (!planId) {
      return { error: 'planId is required' };
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
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe customer portal session' })
  @ApiResponse({
    status: 201,
    description: 'Portal session created',
    type: StripePortalResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Missing required fields' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    schema: { type: 'object', properties: { returnUrl: { type: 'string' } } },
  })
  async createPortal(
    @Req() req: Request,
    @CurrentUser() user: { uid: string },
  ) {
    const { returnUrl } = req.body as { returnUrl: string };

    // We need to fetch the customer ID from the user's subscription or account
    // For now, assuming the service can handle looking up by userId (firebase uid)
    // or we fetch the user's profile to get stripeCustomerId
    // THIS PART NEEDS ADJUSTMENT based on how StripeService works.
    // Let's assume createCustomerPortalSession can take userId or we need to lookup customerId.

    // Looking at the original code, it took customerId.
    // Now we must derive customerId from the authenticated user.
    // I will modify the service call to fetch customerID if possible, or fetch it here.

    // Checking service signature...
    if (!returnUrl) {
      return { error: 'returnUrl is required' };
    }

    // Resolving customerId from user (placeholder until I see service)
    const customerId = await this.stripeService.getCustomerIdByUserId(user.uid);

    if (!customerId) {
      return { error: 'Stripe customer not found' };
    }

    const session = await this.stripeService.createCustomerPortalSession(
      customerId,
      returnUrl,
    );

    return { url: session.url };
  }
}
