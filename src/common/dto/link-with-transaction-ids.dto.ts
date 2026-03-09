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

export class LinkWithTransactionIdsDto {
  @ApiProperty({
    type: 'string',
    description: 'Active session token to link with',
    example: 'eyJhbGciOiJ...',
  })
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @ApiProperty({
    description: 'List of transaction IDs to link',
    type: [TransactionIdDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionIdDto)
  transactionIds: TransactionIdDto[];

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
