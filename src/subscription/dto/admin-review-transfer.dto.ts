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

const MAX_CREDIT = 365;

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
}

export class RejectTransferRequestDto {
  @ApiProperty({
    description: 'Required reason (may be shown to the user when appropriate).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  adminNote!: string;
}
