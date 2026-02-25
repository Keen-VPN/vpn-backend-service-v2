import { ApiProperty } from '@nestjs/swagger';

export class AppleSubscriptionInfoDto {
  @ApiProperty({
    type: 'string',
    example: 'active',
    description: 'Subscription status',
  })
  status: string;

  @ApiProperty({
    type: 'string',
    example: 'Premium VPN - Annual',
    description: 'Plan name',
  })
  planName: string;

  @ApiProperty({
    type: Date,
    description: 'Current period end date',
    required: false,
    nullable: true,
  })
  currentPeriodEnd?: Date | null;
}

export class AppleLinkPurchaseResponseDto {
  @ApiProperty({
    type: 'boolean',
    example: true,
    description: 'Operation success status',
  })
  success: boolean;

  @ApiProperty({
    type: 'string',
    example: 'Purchase linked successfully',
    description: 'Result message',
  })
  message: string;

  @ApiProperty({
    type: AppleSubscriptionInfoDto,
    description: 'Subscription details',
  })
  subscription: AppleSubscriptionInfoDto;
}

export class LinkedPurchaseDto {
  @ApiProperty({ type: 'string', description: 'Transaction ID' })
  transactionId: string;

  @ApiProperty({ type: 'string', description: 'Original Transaction ID' })
  originalTransactionId: string;

  @ApiProperty({ type: 'string', description: 'Product ID' })
  productId: string;

  @ApiProperty({ type: 'string', description: 'Status of the purchase' })
  status: string;

  @ApiProperty({
    type: 'string',
    description: 'Subscription ID associated with the purchase',
  })
  subscriptionId: string;
}

export class PurchaseErrorDto {
  @ApiProperty({
    type: Object,
    description: 'Transaction details causing the error',
  })
  transaction: any;

  @ApiProperty({ type: 'string', description: 'Error message' })
  error: string;
}

export class AppleBulkLinkResponseDto {
  @ApiProperty({
    type: 'boolean',
    example: true,
    description: 'Operation success status',
  })
  success: boolean;

  @ApiProperty({ type: 'string', description: 'Result message' })
  message: string;

  @ApiProperty({
    type: 'number',
    description: 'Number of purchases successfully linked',
  })
  linkedCount: number;

  @ApiProperty({
    type: Number,
    description: 'Total number of transactions processed',
  })
  totalCount: number;

  @ApiProperty({
    type: [LinkedPurchaseDto],
    description: 'List of successfully linked purchases',
    required: false,
  })
  linkedPurchases?: LinkedPurchaseDto[];

  @ApiProperty({
    type: [PurchaseErrorDto],
    description: 'List of errors encountered',
    required: false,
  })
  errors?: PurchaseErrorDto[];
}
