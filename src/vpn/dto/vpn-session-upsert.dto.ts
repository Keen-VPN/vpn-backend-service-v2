import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
  @IsString()
  @IsNotEmpty()
  startAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Omitted or null while tunnel is open',
  })
  @IsOptional()
  @IsString()
  endAt?: string | null;

  @ApiProperty({ example: '2026-05-04T12:00:45.000Z' })
  @IsString()
  @IsNotEmpty()
  lastSeenAt!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  disconnectReason?: string | null;
}
