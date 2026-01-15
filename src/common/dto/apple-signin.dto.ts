import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TransactionIdDto {
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsString()
  @IsNotEmpty()
  originalTransactionId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;
}

export class AppleSignInDto {
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  @IsString()
  @IsNotEmpty()
  userIdentifier: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TransactionIdDto)
  transactionIds?: TransactionIdDto[];

  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @IsString()
  @IsOptional()
  devicePlatform?: string;
}

