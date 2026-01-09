import { ApiProperty } from '@nestjs/swagger';

export class VPNConfigResponseDto {
  @ApiProperty({
    description: 'VPN server endpoint (IP:Port)',
    example: '203.0.113.42:51820',
  })
  endpoint: string;

  @ApiProperty({
    description: 'Server public key for WireGuard',
    example: 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=',
  })
  publicKey: string;

  @ApiProperty({
    description: 'Allowed IP ranges for routing',
    example: ['0.0.0.0/0', '::/0'],
    type: [String],
  })
  allowedIPs: string[];

  @ApiProperty({
    description: 'Client private key (ephemeral)',
    example: 'YAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=',
  })
  privateKey: string;
}
