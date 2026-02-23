import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CapturePurchaseDto {
  @ApiPropertyOptional({
    type: String,
    description: 'The base64 encoded receipt data',
    example: 'MIIT8...',
  })
  @IsString()
  @IsOptional()
  receiptData?: string;

  @ApiProperty({
    type: String,
    description: 'The transaction identifier',
    example: '1000000...',
  })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({
    type: String,
    description: 'The original transaction identifier',
    example: '1000000...',
  })
  @IsString()
  @IsNotEmpty()
  originalTransactionId: string;

  @ApiProperty({
    type: String,
    description: 'The product identifier',
    example: 'com.keen.vpn.monthly',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    type: String,
    description: 'Purchase date in milliseconds',
    example: '1600000000000',
  })
  @IsString()
  @IsNotEmpty()
  purchaseDateMs: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Expiration date in milliseconds',
    example: '1602678400000',
  })
  @IsString()
  @IsOptional()
  expiresDateMs?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Environment (Sandbox/Production)',
    example: 'Sandbox',
  })
  @IsString()
  @IsOptional()
  environment?: string;

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
