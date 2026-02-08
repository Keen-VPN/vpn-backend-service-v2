import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class TransactionIdDto {
  @ApiProperty({ description: 'The transaction identifier', example: '1000000...' })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({ description: 'The original transaction identifier', example: '1000000...' })
  @IsString()
  @IsNotEmpty()
  originalTransactionId: string;

  @ApiProperty({ description: 'The product identifier', example: 'com.keen.vpn.monthly' })
  @IsString()
  @IsNotEmpty()
  productId: string;
}

export class AppleSignInDto {
  @ApiProperty({
    description: 'Apple identity token',
    example: 'eyJraWQiOiJ...',
  })
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  @ApiProperty({
    description: 'Apple user identifier',
    example: '000000.86...',
  })
  @IsString()
  @IsNotEmpty()
  userIdentifier: string;

  @ApiPropertyOptional({
    description: 'User email (only provided on first sign in)',
    example: 'user@example.com',
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'User full name (only provided on first sign in)',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'List of recent transaction IDs for resolving subscription status',
    type: [TransactionIdDto],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TransactionIdDto)
  transactionIds?: TransactionIdDto[];

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

