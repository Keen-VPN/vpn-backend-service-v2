import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, Min, Max } from 'class-validator';

export class PulseDto {
  @ApiProperty({
    description: 'Node ID',
    example: 'node-123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  nodeId: string;

  @ApiProperty({
    description: 'CPU usage percentage (0-100)',
    example: 45.5,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  cpuUsage: number;

  @ApiProperty({
    description: 'Bandwidth usage in Mbps',
    example: 125.3,
  })
  @IsNumber()
  @Min(0)
  bandwidthUsage: number;

  @ApiProperty({
    description: 'Current number of active connections',
    example: 42,
  })
  @IsNumber()
  @Min(0)
  connectionCount: number;

  @ApiProperty({
    description: 'Available capacity for new connections',
    example: 58,
  })
  @IsNumber()
  @Min(0)
  availableCapacity: number;
}
