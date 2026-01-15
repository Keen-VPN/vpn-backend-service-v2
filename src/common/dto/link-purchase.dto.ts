import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LinkPurchaseDto {
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @IsString()
  @IsNotEmpty()
  receiptData: string;

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
  @IsOptional()
  deviceFingerprint?: string;

  @IsString()
  @IsOptional()
  devicePlatform?: string;
}

