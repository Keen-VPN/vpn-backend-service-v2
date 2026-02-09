import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 'uuid-1234', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'User display name',
    required: false,
  })
  displayName?: string | null;

  @ApiProperty({ example: true, description: 'Is email verified' })
  emailVerified: boolean;

  @ApiProperty({
    example: 'google',
    description: 'Auth provider',
    required: false,
  })
  provider?: string | null;
}

export class AccountDeletionResponseDto {
  @ApiProperty({
    example: 'Account deleted successfully',
    description: 'Success message',
  })
  message: string;

  @ApiProperty({ example: 'uuid-1234', description: 'Deleted User ID' })
  id: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Deleted User email',
  })
  email: string;
}
