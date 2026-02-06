import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
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

export class LinkWithTransactionIdsDto {
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionIdDto)
  transactionIds: TransactionIdDto[];

  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @IsString()
  @IsOptional()
  devicePlatform?: string;
}
