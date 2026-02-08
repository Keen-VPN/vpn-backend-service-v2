import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CapturePurchaseDto {
  @ApiPropertyOptional({
    description: 'The base64 encoded receipt data',
    example: 'MIIT8...',
  })
  @IsString()
  @IsOptional()
  receiptData?: string;

  @ApiProperty({
    description: 'The transaction identifier',
    example: '1000000...',
  })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({
    description: 'The original transaction identifier',
    example: '1000000...',
  })
  @IsString()
  @IsNotEmpty()
  originalTransactionId: string;

  @ApiProperty({
    description: 'The product identifier',
    example: 'com.keen.vpn.monthly',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Purchase date in milliseconds',
    example: '1600000000000',
  })
  @IsString()
  @IsNotEmpty()
  purchaseDateMs: string;

  @ApiPropertyOptional({
    description: 'Expiration date in milliseconds',
    example: '1602678400000',
  })
  @IsString()
  @IsOptional()
  expiresDateMs?: string;

  @ApiPropertyOptional({
    description: 'Environment (Sandbox/Production)',
    example: 'Sandbox',
  })
  @IsString()
  @IsOptional()
  environment?: string;

  @ApiPropertyOptional({
    description: 'Device fingerprint for fraud detection',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @ApiPropertyOptional({
    description: 'Device platform (ios, android, web)',
    example: 'ios',
  })
  @IsString()
  @IsOptional()
  devicePlatform?: string;
}

