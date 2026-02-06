import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class GoogleSignInDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @IsString()
  @IsOptional()
  devicePlatform?: string;
}
