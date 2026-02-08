import { ApiProperty } from '@nestjs/swagger';

export class PaymentDto {
  @ApiProperty({ example: 'sub_123456', description: 'Subscription ID' })
  id: string;

  @ApiProperty({ example: 'active', description: 'Subscription status' })
  status: string;

  @ApiProperty({ example: 'premium_monthly', description: 'Plan name' })
  planName: string;

  @ApiProperty({ example: 999, description: 'Price amount' })
  priceAmount: number;

  @ApiProperty({ example: 'usd', description: 'Price currency' })
  priceCurrency: string;

  @ApiProperty({ example: 'month', description: 'Billing period' })
  billingPeriod: string;

  @ApiProperty({
    example: '2023-01-01T00:00:00.000Z',
    description: 'Current period start date',
  })
  currentPeriodStart: Date;

  @ApiProperty({
    example: '2023-02-01T00:00:00.000Z',
    description: 'Current period end date',
  })
  currentPeriodEnd: Date;

  @ApiProperty({ example: 'stripe', description: 'Subscription type' })
  subscriptionType: string;

  @ApiProperty({
    example: '2023-01-01T00:00:00.000Z',
    description: 'Created at',
  })
  createdAt: Date;
}
