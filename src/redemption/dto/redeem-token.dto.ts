import { ApiProperty } from '@nestjs/swagger';

export class RedeemTokenDto {
  @ApiProperty({
    description: 'Blinded token from Auth Service',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token: string;

  @ApiProperty({
    description: 'RSA signature of the token',
    example: 'MEUCIQDXwZ8yV...',
  })
  signature: string;

  @ApiProperty({
    description: 'Preferred region for VPN node (optional)',
    example: 'us-east',
    required: false,
  })
  region?: string;
}
