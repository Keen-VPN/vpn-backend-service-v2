import { ApiProperty } from '@nestjs/swagger';

export class StripeCheckoutResponseDto {
  @ApiProperty({
    type: 'string',
    description: 'Checkout URL',
    required: false,
    nullable: true,
  })
  url: string | null;

  @ApiProperty({ type: 'string', description: 'Session ID' })
  sessionId: string;
}

export class StripePortalResponseDto {
  @ApiProperty({ type: 'string', description: 'Portal URL' })
  url: string;
}
