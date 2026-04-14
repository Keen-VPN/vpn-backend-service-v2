import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateLongestSessionDto {
  @ApiProperty({
    type: 'number',
    description: 'Longest session duration candidate in seconds',
    example: 3600,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  duration_seconds: number;
}

export class LongestSessionResponseDto {
  @ApiProperty({ type: 'number', example: 3600 })
  longest_session_seconds: number;
}
