import { ApiProperty } from '@nestjs/swagger';

export class PaymentDto {
  @ApiProperty({
    type: 'string',
    example: 'sub_123456',
    description: 'Subscription ID',
  })
  id: string;

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
  })
  planName: string;

  @ApiProperty({ type: 'number', example: 999, description: 'Price amount' })
  priceAmount: number;

  @ApiProperty({
    type: 'string',
    example: 'usd',
    description: 'Price currency',
  })
  priceCurrency: string;

  @ApiProperty({
    type: 'string',
    example: 'month',
    description: 'Billing period',
  })
  billingPeriod: string;

  @ApiProperty({
    type: 'string',
    example: '2023-01-01T00:00:00.000Z',
    description: 'Current period start date',
  })
  currentPeriodStart: Date;

  @ApiProperty({
    type: 'string',
    example: '2023-02-01T00:00:00.000Z',
    description: 'Current period end date',
  })
  currentPeriodEnd: Date;

  @ApiProperty({
    type: 'string',
    example: 'stripe',
    description: 'Subscription type',
  })
  subscriptionType: string;

  @ApiProperty({
    type: 'string',
    example: '2023-01-01T00:00:00.000Z',
    description: 'Created at',
  })
  createdAt: Date;
}
