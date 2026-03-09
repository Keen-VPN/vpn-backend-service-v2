import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class TransactionIdDto {
  @ApiProperty({
    type: 'string',
    description: 'The transaction identifier',
    example: '1000000...',
  })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({
    type: 'string',
    description: 'The original transaction identifier',
    example: '1000000...',
  })
  @IsString()
  @IsNotEmpty()
  originalTransactionId: string;

  @ApiProperty({
    type: 'string',
    description: 'The product identifier',
    example: 'com.keen.vpn.monthly',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;
}

export class AppleSignInDto {
  @ApiProperty({
    type: 'string',
    description: 'Apple identity token',
    example: 'eyJraWQiOiJ...',
  })
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  @ApiProperty({
    type: 'string',
    description: 'Apple user identifier',
    example: '000000.86...',
  })
  @IsString()
  @IsNotEmpty()
  userIdentifier: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'User email (only provided on first sign in)',
    example: 'user@example.com',
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'User full name (only provided on first sign in)',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({
    type: () => [TransactionIdDto],
    description:
      'List of recent transaction IDs for resolving subscription status',
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TransactionIdDto)
  transactionIds?: TransactionIdDto[];

  @ApiPropertyOptional({
    type: 'string',
    description: 'Device fingerprint for fraud detection',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Device platform (ios, android, web)',
    example: 'ios',
  })
  @IsString()
  @IsOptional()
  devicePlatform?: string;
}
