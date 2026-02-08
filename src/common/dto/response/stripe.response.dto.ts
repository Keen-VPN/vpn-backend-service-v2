import { ApiProperty } from '@nestjs/swagger';

export class StripeCheckoutResponseDto {
    @ApiProperty({ description: 'Checkout URL', required: false, nullable: true })
    url: string | null;

    @ApiProperty({ description: 'Session ID' })
    sessionId: string;
}

export class StripePortalResponseDto {
    @ApiProperty({ description: 'Portal URL' })
    url: string;
}
