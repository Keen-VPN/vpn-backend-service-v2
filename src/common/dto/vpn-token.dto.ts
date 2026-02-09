import { IsString, IsNotEmpty, IsBase64, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VpnTokenDto {
  @ApiProperty({
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
}
