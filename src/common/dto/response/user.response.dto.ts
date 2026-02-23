import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ type: String, example: 'uuid-1234', description: 'User ID' })
  id: string;

  @ApiProperty({
    type: String,
    example: 'user@example.com',
    description: 'User email',
  })
  email: string;

  @ApiProperty({
    type: String,
    example: 'John Doe',
    description: 'User display name',
    required: false,
  })
  displayName?: string | null;

  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Is email verified',
  })
  emailVerified: boolean;

  @ApiProperty({
    type: String,
    example: 'google',
    description: 'Auth provider',
    required: false,
  })
  provider?: string | null;
}

export class AuthAccountDeletionResponseDto {
  @ApiProperty({
    type: String,
    example: 'Account deleted successfully',
    description: 'Success message',
  })
  message: string;

  @ApiProperty({
    type: String,
    example: 'uuid-1234',
    description: 'Deleted User ID',
  })
  id: string;

  @ApiProperty({
    type: String,
    example: 'user@example.com',
    description: 'Deleted User email',
  })
  email: string;
}
