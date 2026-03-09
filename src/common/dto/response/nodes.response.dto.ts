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
}

export class NodeHeartbeatResponseDto {
  @ApiProperty({
    type: 'string',
    example: 'ok',
    description: 'Status of the heartbeat processing',
  })
  status: string;
}
