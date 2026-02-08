import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  IsBase64,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnonymousSessionDto {
  @ApiProperty({
    description: 'The original random token (base64 encoded) before blinding',
    example: 'uKj...',
  })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  token: string; // The original token (before blinding)

  @ApiProperty({
    description: 'The blind-signed signature (base64 encoded) received from the server',
    example: 'MEUCIQD...',
  })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  signature: string; // The blind-signed signature (after unblinding)

  @ApiProperty({
    description: 'Session start timestamp (ISO 8601)',
    example: '2024-01-01T00:00:00Z',
  })
  @IsString()
  @IsNotEmpty()
  session_start: string;

  @ApiPropertyOptional({
    description: 'Session end timestamp (ISO 8601)',
    example: '2024-01-01T01:00:00Z',
  })
  @IsString()
  @IsOptional()
  session_end?: string;

  @ApiProperty({
    description: 'Duration of the session in seconds',
    example: 3600,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  duration_seconds: number;

  @ApiProperty({
    description: 'Device platform',
    example: 'ios',
  })
  @IsString()
  @IsNotEmpty()
  platform: string;

  @ApiPropertyOptional({
    description: 'Client application version',
    example: '1.0.0',
  })
  @IsString()
  @IsOptional()
  app_version?: string;

  @ApiPropertyOptional({
    description: 'Server location (Country/City)',
    example: 'United States',
  })
  @IsString()
  @IsOptional()
  server_location?: string;

  @ApiPropertyOptional({
    description: 'Server IP address or hostname',
    example: 'vpn-us-1.example.com',
  })
  @IsString()
  @IsOptional()
  server_address?: string;

  @ApiPropertyOptional({
    description: 'User subscription tier',
    example: 'premium',
  })
  @IsString()
  @IsOptional()
  subscription_tier?: string;

  @ApiPropertyOptional({
    description: 'Total bytes transferred during session',
    example: 1048576,
  })
  @IsNumber()
  @IsOptional()
  bytes_transferred?: number;
}
