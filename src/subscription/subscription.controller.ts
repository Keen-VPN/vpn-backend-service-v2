import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import {
  SubscriptionStatusResponseDto,
  CancelSubscriptionResponseDto,
} from '../common/dto/response/subscription.response.dto';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('status-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get subscription status with session token' })
  @ApiResponse({
    status: 200,
    description: 'Subscription status returned',
    type: SubscriptionStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { sessionToken: { type: 'string' } },
    },
  })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getStatusWithSession(@Body() body: { sessionToken: string }) {
    return this.subscriptionService.getStatusWithSession(body.sessionToken);
  }

  @Post('cancel')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription cancelled successfully',
    type: CancelSubscriptionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async cancel(@CurrentUser() user: { uid: string }) {
    const userId = user.uid; // SessionAuthGuard sets uid
    return this.subscriptionService.cancel(userId);
  }
}
