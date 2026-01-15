import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class VerifySessionDto {
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @IsString()
  @IsOptional()
  devicePlatform?: string;
}

