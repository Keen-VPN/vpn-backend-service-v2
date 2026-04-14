import { IsString, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkProviderDto {
  @ApiProperty({
    type: String,
    enum: ['google', 'apple'],
    description: 'Provider to link',
  })
  @IsString()
  @IsIn(['google', 'apple'])
  provider: 'google' | 'apple';

  @ApiProperty({
    type: String,
    description: 'Firebase ID token from the linked provider',
  })
  @IsString()
  @IsNotEmpty()
  firebaseIdToken: string;
}
