import { ApiProperty } from '@nestjs/swagger';
import { TrialStatusDto } from './trial.response.dto';

export class SubscriptionDetailsDto {
  @ApiProperty({
    type: String,
    example: 'sub_123456',
    description: 'Subscription ID',
    required: false,
  })
  id?: string;

  @ApiProperty({
    type: String,
    example: 'active',
    description: 'Subscription status',
  })
  status: string;

  @ApiProperty({
    type: String,
    example: 'premium_monthly',
    description: 'Plan name',
    required: false,
  })
  planName?: string | null;

  @ApiProperty({
    type: String,
    example: 'premium',
    description: 'Plan name alias',
    required: false,
  })
  plan?: string | null;

  @ApiProperty({
    type: Date,
    example: '2023-12-31T23:59:59.999Z',
    description: 'Current period end date',
    required: false,
  })
  currentPeriodEnd?: Date | null;

  @ApiProperty({
    type: String,
    example: '2023-12-31T23:59:59.999Z',
    description: 'End date alias',
    required: false,
  })
  endDate?: string | null;

  @ApiProperty({
    type: Boolean,
    example: false,
    description: 'Cancel at period end flag',
    required: false,
  })
  cancelAtPeriodEnd?: boolean | null;

  @ApiProperty({
    type: String,
    example: 'stripe',
    description: 'Subscription type (stripe/apple)',
    required: false,
  })
  subscriptionType?: string | null;

  @ApiProperty({
    type: String,
    example: 'cus_123456',
    description: 'Customer ID (Stripe/Apple)',
    required: false,
  })
  customerId?: string | null;
}

export class SubscriptionStatusResponseDto {
  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Operation success status',
  })
  success: boolean;

  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Has active subscription',
  })
  hasActiveSubscription: boolean;

  @ApiProperty({
    type: SubscriptionDetailsDto,
    description: 'Subscription details',
  })
  subscription: SubscriptionDetailsDto;

  @ApiProperty({
    type: TrialStatusDto,
    description: 'Trial status details',
    required: false,
    nullable: true,
  })
  trial: TrialStatusDto | null;
}

export class CancelSubscriptionResponseDto {
  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Operation success status',
  })
  success: boolean;

  @ApiProperty({
    type: String,
    example: 'Subscription cancelled successfully',
    description: 'Status message',
  })
  message: string;

  @ApiProperty({
    type: String,
    example: null,
    description: 'Error message if any',
    required: false,
    nullable: true,
  })
  error: string | null;
}
