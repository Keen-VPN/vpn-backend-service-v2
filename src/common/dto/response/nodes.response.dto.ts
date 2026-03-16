import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NodeResponseDto {
  @ApiProperty({ type: 'string', example: 'uuid-1234', description: 'Node ID' })
  id: string;

  @ApiProperty({
    type: 'string',
    example: 'abcd...xyz',
    description: 'WireGuard public key of the node',
  })
  publicKey: string;

  @ApiProperty({
    type: 'string',
    example: 'us-east-1',
    description: 'Node region',
  })
  region: string;

  @ApiPropertyOptional({
    type: 'string',
    example: '1.2.3.4',
    description: 'Public IP address of the node',
  })
  ip?: string;

  @ApiProperty({
    type: 'string',
    example: 'ONLINE',
    enum: ['ONLINE', 'OFFLINE'],
    description: 'Current status of the node',
  })
  status: string;

  @ApiProperty({
    type: 'number',
    example: 95,
    description: 'Calculated health score of the node',
  })
  healthScore: number;

  @ApiProperty({
    type: 'string',
    example: '2023-01-01T00:00:00.000Z',
    description: 'Timestamp of the last received heartbeat',
  })
  lastHeartbeat: Date;

  @ApiPropertyOptional({
    type: 'string',
    example: 'United States',
    description: 'Country where the node is located',
  })
  country?: string;

  @ApiPropertyOptional({
    type: 'string',
    example: 'New York',
    description: 'City where the node is located',
  })
  city?: string;

  @ApiPropertyOptional({
    type: 'string',
    example: 'https://flagcdn.com/w40/us.png',
    description: 'URL to a small flag image of the country',
  })
  flagUrl?: string;

  @ApiPropertyOptional({
    type: 'number',
    example: 40.7128,
    description: 'Latitude of the node location',
  })
  latitude?: number;

  @ApiPropertyOptional({
    type: 'number',
    example: -74.006,
    description: 'Longitude of the node location',
  })
  longitude?: number;
}

export class NodeHeartbeatResponseDto {
  @ApiProperty({
    type: 'string',
    example: 'ok',
    description: 'Status of the heartbeat processing',
  })
  status: string;
}
