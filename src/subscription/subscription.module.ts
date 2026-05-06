import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { AdminSubscriptionTransferController } from './admin-subscription-transfer.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionTransferService } from './subscription-transfer.service';
import { TrialService } from './trial.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PlansConfigService } from './config/plans.config';
import { NotificationModule } from '../notification/notification.module';
import { MembershipTransferS3Service } from './membership-transfer-s3.service';
import { AdminModule } from '../admin/admin.module';
// Stripe subscription period alignment after transfer credit: see `stripe-billing-alignment.todo.ts`.

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    NotificationModule,
    AdminModule,
  ],
  controllers: [SubscriptionController, AdminSubscriptionTransferController],
  providers: [
    SubscriptionService,
    MembershipTransferS3Service,
    SubscriptionTransferService,
    TrialService,
    PlansConfigService,
  ],
  exports: [SubscriptionService, TrialService, PlansConfigService],
})
export class SubscriptionModule {}
