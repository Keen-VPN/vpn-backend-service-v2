import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user.response.dto';
import { SubscriptionDetailsDto } from './subscription.response.dto';
import { TrialStatusDto } from './trial.response.dto';

export class AuthResponseDto {
  @ApiProperty({
    type: 'boolean',
    description: 'Operation success status',
    required: false,
  })
  success?: boolean;

  @ApiProperty({ type: UserResponseDto, description: 'User details' })
  user: UserResponseDto;

  @ApiProperty({
    type: 'string',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Session JWT token',
  })
  sessionToken: string;

  @ApiProperty({
    type: SubscriptionDetailsDto,
    description: 'Active subscription details',
    required: false,
    nullable: true,
  })
  subscription: SubscriptionDetailsDto | null;

  @ApiProperty({
    type: String,
    example: 'google',
    description: 'Authentication method',
    required: false,
  })
  authMethod?: string;
}

export class VerifySessionResponseDto {
  @ApiProperty({ type: 'boolean', description: 'Operation success status' })
  success: boolean;

  @ApiProperty({ type: UserResponseDto, description: 'User details' })
  user: UserResponseDto;

  @ApiProperty({
    type: SubscriptionDetailsDto,
    description: 'Active subscription details',
    required: false,
    nullable: true,
  })
  subscription: SubscriptionDetailsDto | null;

  @ApiProperty({
    type: TrialStatusDto,
    description: 'Trial status details',
    required: false,
    nullable: true,
  })
  trial: TrialStatusDto | null;
}

export class LogoutResponseDto {
  @ApiProperty({
    type: 'boolean',
    example: true,
    description: 'Logout success status',
  })
  success: boolean;
}
