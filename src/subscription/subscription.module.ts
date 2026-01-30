import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { TrialService } from './trial.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, TrialService],
  exports: [SubscriptionService, TrialService],
})
export class SubscriptionModule {}
