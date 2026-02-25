import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterNodeDto {
  @ApiProperty({
    description: 'The Public Key of the WireGuard interface',
    example: 'abcd...xyz',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @ApiProperty({
    description: 'The geographical region of the node',
    example: 'us-east-1',
  })
  @IsString()
  @IsNotEmpty()
  region: string;

  @ApiPropertyOptional({
    description: 'A friendly name for the node',
    example: 'NY-Exit-01',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'The public IP address of the node',
    example: '1.2.3.4',
  })
  @IsString()
  @IsOptional()
  publicIp?: string;

  @ApiProperty({
    description: 'The current status of the node',
    example: 'ONLINE',
    enum: ['ONLINE', 'OFFLINE'],
  })
  @IsString()
  @IsNotEmpty()
  status: string;
}
