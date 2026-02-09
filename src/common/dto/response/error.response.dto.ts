import { ApiProperty } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../interfaces/api-error.interface';

export class ApiErrorDto {
  @ApiProperty({
    description: 'Error code (HTTP status or custom code)',
    example: 400,
  })
  code: string | number;

  @ApiProperty({ description: 'Error message', example: 'Validation failed' })
  message: string;

  @ApiProperty({
    description: 'Optional error details (e.g. validation errors)',
    required: false,
  })
  details?: any;
}

export class ApiErrorResponseDto implements ApiErrorResponse {
  @ApiProperty({ description: 'Operation failure status', example: false })
  success: boolean;

  @ApiProperty({ description: 'Error details object', type: ApiErrorDto })
  error: ApiErrorDto;

  @ApiProperty({
    description: 'Timestamp of the error',
    example: '2023-10-27T10:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({ description: 'Request path', example: '/api/auth/login' })
  path: string;

  @ApiProperty({
    description: 'Request ID for tracing',
    example: 'a1b2c3d4-e5f6-...',
  })
  requestId?: string;

  @ApiProperty({
    description: 'Stack trace (Development only)',
    required: false,
  })
  stack?: string;
}
