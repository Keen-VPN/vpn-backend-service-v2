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
  ApiConsumes,
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
import { SubscriptionTransferService } from './subscription-transfer.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { PresignProofUploadDto } from './dto/presign-proof-upload.dto';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(
    @Inject(SubscriptionService)
    private readonly subscriptionService: SubscriptionService,
    @Inject(SubscriptionTransferService)
    private readonly subscriptionTransferService: SubscriptionTransferService,
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

  @Get('transfer-request')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user membership transfer request' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getTransferRequest(@CurrentUser() user: { uid: string }) {
    return this.subscriptionTransferService.getMyRequest(user.uid);
  }

  @Post('transfer-request/presigned-upload')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get presigned S3 PUT URL for membership transfer proof image',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  @ApiResponse({ status: 503, description: 'S3 not configured' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async presignedMembershipTransferUpload(
    @CurrentUser() user: { uid: string },
    @Body() body: PresignProofUploadDto,
  ) {
    return this.subscriptionTransferService.createPresignedProofUpload(
      user.uid,
      body,
    );
  }

  @Post('transfer-request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('application/json')
  @ApiOperation({
    summary:
      'Submit membership transfer request (competitor VPN → Keen credit)',
  })
  @ApiBody({ type: CreateTransferRequestDto })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 401 })
  @ApiResponse({ status: 409, description: 'Already submitted' })
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  async createTransferRequest(
    @CurrentUser() user: { uid: string },
    @Body() body: CreateTransferRequestDto,
  ) {
    return this.subscriptionTransferService.createRequest(user.uid, body);
  }
}
