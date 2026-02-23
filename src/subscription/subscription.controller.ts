import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
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
  GetPlansResponseDto,
  GetPlanByIdResponseDto,
} from '../common/dto/response/subscription.response.dto';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(
    @Inject(SubscriptionService)
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all subscription plans' })
  @ApiResponse({
    status: 200,
    description: 'List of subscription plans',
    type: GetPlansResponseDto,
  })
  getPlans() {
    return this.subscriptionService.getPlans();
  }

  @Get('plan/:id')
  @ApiOperation({ summary: 'Get a specific plan by ID' })
  @ApiResponse({
    status: 200,
    description: 'Specific subscription plan details',
    type: GetPlanByIdResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  getPlanById(@Param('id') id: string) {
    return this.subscriptionService.getPlanById(id);
  }

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
