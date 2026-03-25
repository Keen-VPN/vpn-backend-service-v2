import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LinkProviderSecondaryUserDto {
  @ApiProperty({ type: 'string', description: 'User ID' })
  id: string;

  @ApiProperty({ type: 'string', description: 'User email' })
  email: string;

  @ApiProperty({ type: 'string', description: 'Auth provider' })
  provider: string;

  @ApiProperty({
    type: 'boolean',
    description: 'Whether this user has an active subscription',
  })
  hasActiveSubscription: boolean;
}

export class LinkProviderCheckResponseDto {
  @ApiProperty({
    type: 'string',
    enum: ['already_linked', 'fresh_link', 'merge_required', 'blocked'],
    description: 'The action to take',
  })
  action: 'already_linked' | 'fresh_link' | 'merge_required' | 'blocked';

  @ApiPropertyOptional({
    type: LinkProviderSecondaryUserDto,
    description: 'Secondary user details (when merge_required)',
  })
  secondaryUser?: LinkProviderSecondaryUserDto;

  @ApiPropertyOptional({
    type: 'string',
    description: 'Reason for blocking (when blocked)',
  })
  reason?: string;
}

export class LinkProviderConfirmResponseDto {
  @ApiProperty({ type: 'boolean', description: 'Operation success' })
  success: boolean;

  @ApiProperty({
    type: 'string',
    enum: ['linked', 'merged'],
    description: 'Action performed',
  })
  action: 'linked' | 'merged';

  @ApiProperty({
    type: [String],
    description: 'Linked providers after operation',
    example: ['google', 'apple'],
  })
  linkedProviders: string[];

  @ApiPropertyOptional({
    type: 'string',
    description: 'New session token if primary user changed',
  })
  newSessionToken?: string;
}
