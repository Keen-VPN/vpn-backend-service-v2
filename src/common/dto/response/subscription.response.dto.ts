import { ApiProperty } from '@nestjs/swagger';
import { TrialStatusDto } from './trial.response.dto';

export class SubscriptionDetailsDto {
  @ApiProperty({
    type: 'string',
    example: 'sub_123456',
    description: 'Subscription ID',
    required: false,
  })
  id?: string;

  @ApiProperty({
    type: 'string',
    example: 'active',
    description: 'Subscription status',
  })
  status: string;

  @ApiProperty({
    type: 'string',
    example: 'premium_monthly',
    description: 'Plan name',
    required: false,
  })
  planName?: string | null;

  @ApiProperty({
    type: 'string',
    example: 'premium',
    description: 'Plan name alias',
    required: false,
  })
  plan?: string | null;

  @ApiProperty({
    type: 'string',
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
    type: 'boolean',
    example: false,
    description: 'Cancel at period end flag',
    required: false,
  })
  cancelAtPeriodEnd?: boolean | null;

  @ApiProperty({
    type: 'string',
    example: 'stripe',
    description: 'Subscription type (stripe/apple)',
    required: false,
  })
  subscriptionType?: string | null;

  @ApiProperty({
    type: 'string',
    example: 'cus_123456',
    description: 'Customer ID (Stripe/Apple)',
    required: false,
  })
  customerId?: string | null;
}

export class SubscriptionStatusResponseDto {
  @ApiProperty({
    type: 'boolean',
    example: true,
    description: 'Operation success status',
  })
  success: boolean;

  @ApiProperty({
    type: 'boolean',
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
    type: 'boolean',
    example: true,
    description: 'Operation success status',
  })
  success: boolean;

  @ApiProperty({
    type: 'string',
    example: 'Subscription cancelled successfully',
    description: 'Status message',
  })
  message: string;

  @ApiProperty({
    type: 'string',
    example: null,
    description: 'Error message if any',
    required: false,
    nullable: true,
  })
  error: string | null;
}

export class SubscriptionPlanFeatureDto {
  @ApiProperty({ type: 'string', example: 'Unlimited bandwidth' })
  name: string;

  @ApiProperty({ type: Boolean, example: true })
  included: boolean;

  @ApiProperty({ type: 'boolean', example: true, required: false })
  highlighted?: boolean;
}

export class SubscriptionPlanDto {
  @ApiProperty({ type: 'string', example: 'premium_monthly' })
  id: string;

  @ApiProperty({ type: 'string', example: 'Premium VPN - Monthly' })
  name: string;

  @ApiProperty({ type: 'number', example: 10.0 })
  price: number;

  @ApiProperty({ type: String, example: 'month' })
  period: string;

  @ApiProperty({ type: String, example: 'month' })
  interval: string;

  @ApiProperty({ type: String, example: 'month' })
  billingPeriod: string;

  @ApiProperty({ type: [SubscriptionPlanFeatureDto] })
  features: SubscriptionPlanFeatureDto[];

  @ApiProperty({ type: 'string', example: 'price_1...' })
  priceId: string;
}

export class GetPlansDataDto {
  @ApiProperty({ type: [SubscriptionPlanDto] })
  plans: SubscriptionPlanDto[];
}

export class GetPlansResponseDto {
  @ApiProperty({ type: 'boolean', example: true })
  success: boolean;

  @ApiProperty({ type: GetPlansDataDto })
  data: GetPlansDataDto;
}

export class GetPlanByIdDataDto {
  @ApiProperty({ type: SubscriptionPlanDto })
  plan: SubscriptionPlanDto;
}

export class GetPlanByIdResponseDto {
  @ApiProperty({ type: 'boolean', example: true })
  success: boolean;

  @ApiProperty({ type: GetPlanByIdDataDto })
  data: GetPlanByIdDataDto;
}
