import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifySessionDto {
  @ApiProperty({
    type: String,
    description: 'Active session token to verify',
    example: 'eyJhbGciOiJ...',
  })
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Device fingerprint for fraud detection',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Device platform (ios, android, web)',
    example: 'ios',
  })
  @IsString()
  @IsOptional()
  devicePlatform?: string;
}
