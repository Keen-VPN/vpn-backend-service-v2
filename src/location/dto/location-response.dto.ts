import { ApiProperty } from '@nestjs/swagger';

export class LocationResponseDto {
  @ApiProperty({
    description: 'Region identifier',
    example: 'us-east',
  })
  region: string;

  @ApiProperty({
    description: 'Country code (ISO 3166-1 alpha-2)',
    example: 'US',
  })
  country: string;

  @ApiProperty({
    description: 'City name',
    example: 'New York',
    required: false,
  })
  city?: string;

  @ApiProperty({
    description: 'Number of active nodes in this location',
    example: 15,
  })
  availableNodes: number;

  @ApiProperty({
    description: 'Average load across all nodes (0-100)',
    example: 45.3,
  })
  averageLoad: number;
}
