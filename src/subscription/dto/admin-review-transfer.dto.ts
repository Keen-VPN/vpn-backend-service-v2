import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_CREDIT = 180;

export class ApproveTransferRequestDto {
  @ApiProperty({ minimum: 1, maximum: MAX_CREDIT })
  @IsInt()
  @Min(1)
  @Max(MAX_CREDIT)
  approvedCreditDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;

  @ApiPropertyOptional({
    description: 'Opaque admin id for audit (email, staff id, etc.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  reviewedByAdminId?: string;
}

export class RejectTransferRequestDto {
  @ApiProperty({
    description: 'Required reason (may be shown to the user when appropriate).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  adminNote!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  reviewedByAdminId?: string;
}
