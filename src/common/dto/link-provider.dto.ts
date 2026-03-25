import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkProviderDto {
  @ApiProperty({
    type: 'string',
    enum: ['google', 'apple'],
    description: 'The auth provider to link',
    example: 'apple',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'apple'])
  provider: 'google' | 'apple';

  @ApiProperty({
    type: 'string',
    description:
      'Firebase ID token (for Google) or Apple identity token (for Apple)',
    example: 'eyJhbGciOiJ...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
