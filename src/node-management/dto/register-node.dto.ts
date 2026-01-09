import { ApiProperty } from '@nestjs/swagger';

export class RegisterNodeDto {
  @ApiProperty({
    description: 'Public IP address of the VPN node',
    example: '203.0.113.42',
  })
  ipAddress: string;

  @ApiProperty({
    description: 'WireGuard public key of the node',
    example: 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=',
  })
  publicKey: string;

  @ApiProperty({
    description: 'Geographic region of the node',
    example: 'us-east',
  })
  region: string;

  @ApiProperty({
    description: 'City where the node is located',
    example: 'New York',
    required: false,
  })
  city?: string;

  @ApiProperty({
    description: 'Country code (ISO 3166-1 alpha-2)',
    example: 'US',
  })
  country: string;

  @ApiProperty({
    description: 'Maximum number of concurrent connections',
    example: 100,
  })
  capacity: number;
}
