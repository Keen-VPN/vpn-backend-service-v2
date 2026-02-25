import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterNodeDto {
  @ApiProperty({
    type: 'string',
    description: 'The Public Key of the WireGuard interface',
    example: 'abcd...xyz',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @ApiProperty({
    type: 'string',
    description: 'The geographical region of the node',
    example: 'us-east-1',
  })
  @IsString()
  @IsNotEmpty()
  region: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'A friendly name for the node',
    example: 'NY-Exit-01',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'The public IP address of the node',
    example: '1.2.3.4',
  })
  @IsString()
  @IsOptional()
  publicIp?: string;

  @ApiProperty({
    type: 'string',
    description: 'The current status of the node',
    example: 'ONLINE',
    enum: ['ONLINE', 'OFFLINE'],
  })
  @IsString()
  @IsNotEmpty()
  status: string;
}
