import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { TrialService } from './trial.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PlansConfigService } from './config/plans.config';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule, NotificationModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, TrialService, PlansConfigService],
  exports: [SubscriptionService, TrialService, PlansConfigService],
})
export class SubscriptionModule {}
