import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterPushTokenDto {
  @ApiProperty({
    description: 'Active session token associated with the device',
    example: 'eyJhbGciOiJ...',
  })
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @ApiProperty({
    description: 'The push notification token (APNs/FCM)',
    example: 'f23c4d...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description: 'Device hash/fingerprint',
    example: 'hash123...',
  })
  @IsString()
  @IsOptional()
  deviceHash?: string;

  @ApiPropertyOptional({
    description: 'Device platform (ios, android, web)',
    example: 'ios',
  })
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiPropertyOptional({
    description: 'Environment (Sandbox/Production)',
    example: 'Production',
  })
  @IsString()
  @IsOptional()
  environment?: string;
}
