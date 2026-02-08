import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user.response.dto';
import { SubscriptionDetailsDto } from './subscription.response.dto';
import { PaymentDto } from './payment.response.dto';

export class UserProfileResponseDto {
    @ApiProperty({ type: UserResponseDto, description: 'User details' })
    user: UserResponseDto;

    @ApiProperty({ type: SubscriptionDetailsDto, description: 'Active subscription details', required: false, nullable: true })
    subscription: SubscriptionDetailsDto | null;
}

export class AccountDeletionResponseDto {
    @ApiProperty({ example: true, description: 'Deletion success status' })
    success: boolean;

    @ApiProperty({ example: 'uuid-1234', description: 'ID of deleted user' })
    deletedUserId: string;

    @ApiProperty({ example: ['cus_123456'], description: 'Associated Stripe customer IDs to clean up' })
    stripeCustomerIds: string[];
}

export class PaymentHistoryResponseDto {
    @ApiProperty({ type: [PaymentDto], description: 'List of past payments' })
    payments: PaymentDto[];
}
