import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  IsBase64,
} from 'class-validator';

export class AnonymousSessionDto {
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  token: string; // The original token (before blinding)

  @IsString()
  @IsNotEmpty()
  @IsBase64()
  signature: string; // The blind-signed signature (after unblinding)

  @IsString()
  @IsNotEmpty()
  session_start: string;

  @IsString()
  @IsOptional()
  session_end?: string;

  @IsInt()
  @Min(0)
  duration_seconds: number;

  @IsString()
  @IsNotEmpty()
  platform: string;

  @IsString()
  @IsOptional()
  app_version?: string;

  @IsString()
  @IsOptional()
  server_location?: string;

  @IsString()
  @IsOptional()
  server_address?: string;

  @IsString()
  @IsOptional()
  subscription_tier?: string;

  @IsNumber()
  @IsOptional()
  bytes_transferred?: number;
}
