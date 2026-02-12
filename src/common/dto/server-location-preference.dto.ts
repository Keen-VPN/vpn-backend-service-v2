import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class ServerLocationPreferenceBodyDto {
  @ApiPropertyOptional({
    description:
      'Client-generated session ID (UUID), same as connection sessions',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  client_session_id?: string;

  @ApiProperty({ description: 'Country code or name requested' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  country: string;

  @ApiProperty({ description: 'Reason for the server location request' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}
