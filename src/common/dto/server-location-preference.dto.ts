import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ServerLocationPreferenceBodyDto {
  @ApiProperty({ description: 'Region code or name requested' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  region: string;

  @ApiProperty({ description: 'Reason for the server location request' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}
