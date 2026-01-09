import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class RegisterNodeDto {
  @ApiProperty({
    description: 'Public IP address of the VPN node',
    example: '203.0.113.42',
  })
  @IsString()
  @IsNotEmpty()
  ipAddress: string;

  @ApiProperty({
    description: 'WireGuard public key of the node',
    example: 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @ApiProperty({
    description: 'Geographic region of the node',
    example: 'us-east',
  })
  @IsString()
  @IsNotEmpty()
  region: string;

  @ApiProperty({
    description: 'City where the node is located',
    example: 'New York',
    required: false,
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({
    description: 'Country code (ISO 3166-1 alpha-2)',
    example: 'US',
  })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({
    description: 'Maximum number of concurrent connections',
    example: 100,
  })
  @IsNumber()
  @Min(1)
  capacity: number;
}
