import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
import { SessionTokenDto } from '../common/dto/session-token.dto';

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
  @ApiBody({ type: SessionTokenDto })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getStatusWithSession(@Body() body: SessionTokenDto) {
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

  @Get('history')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription history (paginated)' })
  @ApiResponse({ status: 200, description: 'Subscription history returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getHistory(
    @CurrentUser() user: { uid: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('provider') provider?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const userId = user.uid;
    return this.subscriptionService.getHistory(userId, {
      page,
      limit,
      provider,
      dateFrom,
      dateTo,
    });
  }

  @Post('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get subscription history via session token' })
  @ApiResponse({ status: 200, description: 'Subscription history returned' })
  @ApiBody({ type: SessionTokenDto })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getHistoryWithSession(
    @Body()
    body: SessionTokenDto & {
      page?: number;
      limit?: number;
      provider?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    return this.subscriptionService.getHistoryWithSession(
      body.sessionToken,
      body,
    );
  }

  @Get('history/:id/details')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription history event details' })
  @ApiResponse({
    status: 200,
    description: 'Subscription history event details returned',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getHistoryEventDetails(
    @CurrentUser() user: { uid: string },
    @Param('id') eventId: string,
  ) {
    const userId = user.uid;
    return this.subscriptionService.getHistoryEventDetails(userId, eventId);
  }
}
