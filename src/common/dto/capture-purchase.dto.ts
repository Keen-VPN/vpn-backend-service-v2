import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CapturePurchaseDto {
  @IsString()
  @IsOptional()
  receiptData?: string;

  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsString()
  @IsNotEmpty()
  originalTransactionId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  purchaseDateMs: string;

  @IsString()
  @IsOptional()
  expiresDateMs?: string;

  @IsString()
  @IsOptional()
  environment?: string;

  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @IsString()
  @IsOptional()
  devicePlatform?: string;
}
