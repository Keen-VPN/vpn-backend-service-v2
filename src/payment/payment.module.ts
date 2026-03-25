import { Module, forwardRef } from '@nestjs/common';
import { StripeService } from './stripe/stripe.service';
import { StripeWebhookController } from './stripe/stripe.webhook.controller';
import { AppleService } from './apple/apple.service';
import { AppleWebhookController } from './apple/apple.webhook.controller';
import { AppleIAPController } from './apple/apple-iap.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationModule,
    forwardRef(() => SubscriptionModule),
  ],
  controllers: [
    StripeWebhookController,
    AppleWebhookController,
    AppleIAPController,
  ],
  providers: [StripeService, AppleService],
  exports: [StripeService, AppleService],
})
export class PaymentModule {}
