import { Module } from '@nestjs/common';
import { StripeService } from './stripe/stripe.service';
import { StripeWebhookController } from './stripe/stripe.webhook.controller';
import { AppleService } from './apple/apple.service';
import { AppleWebhookController } from './apple/apple.webhook.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StripeWebhookController, AppleWebhookController],
  providers: [StripeService, AppleService],
  exports: [StripeService, AppleService],
})
export class PaymentModule {}

