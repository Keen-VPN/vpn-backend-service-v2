import { ApiProperty } from '@nestjs/swagger';

export class PulseDto {
  @ApiProperty({
    description: 'Node ID',
    example: 'node-123e4567-e89b-12d3-a456-426614174000',
  })
  nodeId: string;

  @ApiProperty({
    description: 'CPU usage percentage (0-100)',
    example: 45.5,
  })
  cpuUsage: number;

  @ApiProperty({
    description: 'Bandwidth usage in Mbps',
    example: 125.3,
  })
  bandwidthUsage: number;

  @ApiProperty({
    description: 'Current number of active connections',
    example: 42,
  })
  connectionCount: number;

  @ApiProperty({
    description: 'Available capacity for new connections',
    example: 58,
  })
  availableCapacity: number;
}
