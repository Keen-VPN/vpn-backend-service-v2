import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemTokenDto {
  @ApiProperty({
    description: 'The unblinded token string',
    example: 'token_123',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'The unblinded signature', example: 'sig_123' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({
    description: 'ID of the VPN server to generate credentials for',
    example: 'us-east-1',
  })
  @IsString()
  @IsNotEmpty()
  serverId: string;
}
