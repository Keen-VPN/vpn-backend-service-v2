import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto {
  @ApiProperty({ type: 'boolean', description: 'Operation success status' })
  success: boolean;

  @ApiProperty({
    type: String,
    description: 'Optional message providing more details',
    required: false,
  })
  message?: string;

  @ApiProperty({
    type: String,
    description: 'Error message if operation failed',
    required: false,
  })
  error?: string;
}
