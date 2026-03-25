import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    type: 'string',
    description: 'Firebase ID token for authentication',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjZm...',
    minLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Length(100, 2000) // Firebase tokens are ~1000+ chars
  idToken: string;

  @ApiPropertyOptional({
    type: 'string',
    required: false,
    enum: ['google', 'apple'],
    description:
      'Optional provider hint. Useful when Firebase sign_in_provider is missing/incorrect (e.g. Apple).',
    example: 'apple',
  })
  @IsOptional()
  @IsIn(['google', 'apple'])
  provider?: 'google' | 'apple';
}
