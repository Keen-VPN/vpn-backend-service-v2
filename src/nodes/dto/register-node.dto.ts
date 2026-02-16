import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RegisterNodeDto {
  @IsString()
  @IsNotEmpty()
  public_key: string;

  @IsString()
  @IsNotEmpty()
  region: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  ip?: string;
}
