import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterPushTokenDto {
  @ApiProperty({
    type: String,
    description: 'Active session token associated with the device',
    example: 'eyJhbGciOiJ...',
  })
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @ApiProperty({
    type: String,
    description: 'The push notification token (APNs/FCM)',
    example: 'f23c4d...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Device hash/fingerprint',
    example: 'hash123...',
  })
  @IsString()
  @IsOptional()
  deviceHash?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Device platform (ios, android, web)',
    example: 'ios',
  })
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Environment (Sandbox/Production)',
    example: 'Production',
  })
  @IsString()
  @IsOptional()
  environment?: string;
}
