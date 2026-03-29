import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkProviderDto {
  @ApiProperty({ enum: ['google', 'apple'], description: 'Provider to link' })
  @IsString()
  @IsIn(['google', 'apple'])
  provider: 'google' | 'apple';

  @ApiProperty({ description: 'Firebase ID token from the linked provider' })
  @IsString()
  firebaseIdToken: string;
}
