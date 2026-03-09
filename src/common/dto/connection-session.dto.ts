import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectionSessionDto {
  @ApiProperty({
    type: 'string',
    description: 'Unique client-generated session ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  client_session_id: string;

  @ApiProperty({
    type: 'string',
    description: 'Event type (START, HEARTBEAT, END)',
    example: 'START',
    enum: ['START', 'HEARTBEAT', 'END'],
  })
  @IsString()
  @IsNotEmpty()
  event_type: 'START' | 'HEARTBEAT' | 'END';

  @ApiProperty({
    type: 'string',
    description: 'Session start timestamp (ISO 8601)',
    example: '2024-01-01T00:00:00Z',
  })
  @IsString()
  @IsNotEmpty()
  session_start: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Session end timestamp (ISO 8601)',
    example: '2024-01-01T01:00:00Z',
  })
  @IsString()
  @IsOptional()
  session_end?: string;

  @ApiProperty({
    type: 'number',
    description: 'Duration of the session in seconds',
    example: 3600,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  duration_seconds: number;

  @ApiProperty({
    type: 'string',
    description: 'Device platform',
    example: 'ios',
  })
  @IsString()
  @IsNotEmpty()
  platform: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Client application version',
    example: '1.0.0',
  })
  @IsString()
  @IsOptional()
  app_version?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Server location (Country/City)',
    example: 'United States',
  })
  @IsString()
  @IsOptional()
  server_location?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'VPN Protocol used',
    example: 'wireguard',
  })
  @IsString()
  @IsOptional()
  protocol?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Network type (wifi, cellular, etc.)',
    example: 'wifi',
  })
  @IsString()
  @IsOptional()
  network_type?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Reason for disconnection',
    example: 'USER_TERMINATION',
  })
  @IsString()
  @IsOptional()
  disconnect_reason?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'User subscription tier',
    example: 'premium',
  })
  @IsString()
  @IsOptional()
  subscription_tier?: string;

  @ApiPropertyOptional({
    type: 'number',
    description: 'Total bytes transferred during session',
    example: 1048576,
  })
  @IsNumber()
  @IsOptional()
  bytes_transferred?: number;
}
