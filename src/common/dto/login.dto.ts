import { IsString, IsNotEmpty, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Length(100, 2000) // Firebase tokens are ~1000+ chars
  idToken: string;
}
