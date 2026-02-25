import { ApiProperty } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../interfaces/api-error.interface';

export class ApiErrorDto {
  @ApiProperty({
    description: 'Error code (HTTP status or custom code)',
    example: 400,
    type: 'string',
  })
  code: string | number;

  @ApiProperty({
    description: 'Error message',
    example: 'Validation failed',
    type: 'string',
  })
  message: string;

  @ApiProperty({
    description: 'Optional error details (e.g. validation errors)',
    required: false,
    type: Object,
  })
  details?: any;
}

export class ApiErrorResponseDto implements ApiErrorResponse {
  @ApiProperty({
    type: 'boolean',
    example: false,
    description: 'Operation success status',
  })
  success: boolean;

  @ApiProperty({ description: 'Error details object', type: ApiErrorDto })
  error: ApiErrorDto;

  @ApiProperty({
    description: 'Timestamp of the error',
    example: '2023-10-27T10:00:00.000Z',
    type: 'string',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path',
    example: '/api/auth/login',
    type: 'string',
  })
  path: string;

  @ApiProperty({
    description: 'Request ID for tracing',
    example: 'a1b2c3d4-e5f6-...',
    type: String,
  })
  requestId?: string;

  @ApiProperty({
    description: 'Stack trace (Development only)',
    required: false,
    type: 'string',
  })
  stack?: string;
}
