import { IsString, IsNotEmpty, IsBase64 } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VpnCredentialDto {
  @ApiProperty({
    description: 'The original token (before blinding), base64 encoded',
    example: 'uKj...',
  })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  token: string; // The original token (before blinding)

  @ApiProperty({
    description: 'The blind-signed signature (after unblinding), base64 encoded',
    example: 'MEUCIQD...',
  })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  signature: string; // The blind-signed signature (after unblinding)

  @ApiProperty({
    description: 'The VPN server ID to connect to using these credentials',
    example: 'us-east-1',
  })
  @IsString()
  @IsNotEmpty()
  serverId: string; // The VPN server ID to connect to
}
