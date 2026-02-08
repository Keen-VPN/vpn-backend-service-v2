import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Firebase ID token for authentication',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjZm...',
    minLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Length(100, 2000) // Firebase tokens are ~1000+ chars
  idToken: string;
}

