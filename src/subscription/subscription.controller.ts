import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('status-session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getStatusWithSession(@Body() body: { sessionToken: string }) {
    return this.subscriptionService.getStatusWithSession(body.sessionToken);
  }

  @Post('cancel')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async cancel(@CurrentUser() user: any) {
    const userId = user.uid; // SessionAuthGuard sets uid
    return this.subscriptionService.cancel(userId);
  }
}

