import {
  IsString,
  IsNotEmpty,
  IsBase64,
  Length,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VpnTokenDto {
  @ApiProperty({
    type: 'string',
    description: 'Base64 encoded blinded token to be signed',
    example: 'fd78a...',
    minLength: 100,
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  @Length(100, 5000) // Base64 encoded blinded token
  blindedToken: string;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Optional session token (alternative to Bearer auth header)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsOptional()
  sessionToken?: string;
}
