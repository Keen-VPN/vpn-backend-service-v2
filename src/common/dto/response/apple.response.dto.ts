import { ApiProperty } from '@nestjs/swagger';

export class AppleSubscriptionInfoDto {
    @ApiProperty({ example: 'active', description: 'Subscription status' })
    status: string;

    @ApiProperty({ example: 'Premium VPN - Annual', description: 'Plan name' })
    planName: string;

    @ApiProperty({ description: 'Current period end date', required: false, nullable: true })
    currentPeriodEnd?: Date | null;
}

export class AppleLinkPurchaseResponseDto {
    @ApiProperty({ example: true, description: 'Operation success status' })
    success: boolean;

    @ApiProperty({ example: 'Purchase linked successfully', description: 'Result message' })
    message: string;

    @ApiProperty({ type: AppleSubscriptionInfoDto, description: 'Subscription details' })
    subscription: AppleSubscriptionInfoDto;
}

export class LinkedPurchaseDto {
    @ApiProperty({ description: 'Transaction ID' })
    transactionId: string;

    @ApiProperty({ description: 'Original Transaction ID' })
    originalTransactionId: string;

    @ApiProperty({ description: 'Product ID' })
    productId: string;

    @ApiProperty({ description: 'Status of the purchase' })
    status: string;

    @ApiProperty({ description: 'Subscription ID associated with the purchase' })
    subscriptionId: string;
}

export class PurchaseErrorDto {
    @ApiProperty({ description: 'Transaction details causing the error' })
    transaction: any;

    @ApiProperty({ description: 'Error message' })
    error: string;
}

export class AppleBulkLinkResponseDto {
    @ApiProperty({ example: true, description: 'Operation success status' })
    success: boolean;

    @ApiProperty({ description: 'Result message' })
    message: string;

    @ApiProperty({ description: 'Number of purchases successfully linked' })
    linkedCount: number;

    @ApiProperty({ description: 'Total number of transactions processed' })
    totalCount: number;

    @ApiProperty({ type: [LinkedPurchaseDto], description: 'List of successfully linked purchases', required: false })
    linkedPurchases?: LinkedPurchaseDto[];

    @ApiProperty({ type: [PurchaseErrorDto], description: 'List of errors encountered', required: false })
    errors?: PurchaseErrorDto[];
}
