import { IsString, IsNotEmpty, IsBase64, Length } from 'class-validator';

export class VpnTokenDto {
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  @Length(100, 5000) // Base64 encoded blinded token
  blindedToken: string;
}

