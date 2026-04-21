import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NotificationService } from './notification.service';
import { PaidConversionSlackService } from './paid-conversion-slack.service';

@Module({
  imports: [HttpModule],
  providers: [NotificationService, PaidConversionSlackService],
  exports: [NotificationService, PaidConversionSlackService],
})
export class NotificationModule {}
