import { ApiProperty } from '@nestjs/swagger';

export class StripeCheckoutResponseDto {
  @ApiProperty({
    type: String,
    description: 'Checkout URL',
    required: false,
    nullable: true,
  })
  url: string | null;

  @ApiProperty({ type: String, description: 'Session ID' })
  sessionId: string;
}

export class StripePortalResponseDto {
  @ApiProperty({ type: String, description: 'Portal URL' })
  url: string;
}
