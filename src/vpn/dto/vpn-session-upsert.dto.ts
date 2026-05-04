import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class VpnSessionUpsertDto {
  @ApiProperty({ description: 'Client-generated session id (UUID)' })
  @IsUUID('4')
  id!: string;

  @ApiProperty({ example: '2026-05-04T12:00:00.000Z' })
  @IsISO8601()
  @IsString()
  @IsNotEmpty()
  startAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Omitted or null while tunnel is open',
  })
  @IsOptional()
  @IsISO8601()
  @IsString()
  endAt?: string | null;

  @ApiProperty({ example: '2026-05-04T12:00:45.000Z' })
  @IsISO8601()
  @IsString()
  @IsNotEmpty()
  lastSeenAt!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  disconnectReason?: string | null;
}
