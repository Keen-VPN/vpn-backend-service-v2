import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UnlinkProviderDto {
  @ApiProperty({
    type: String,
    enum: ['google', 'apple'],
    description: 'Provider to unlink',
  })
  @IsString()
  @IsIn(['google', 'apple'])
  provider: 'google' | 'apple';
}
