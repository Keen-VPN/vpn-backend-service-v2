import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto {
    @ApiProperty({ description: 'Operation success status' })
    success: boolean;

    @ApiProperty({ description: 'Optional message providing more details', required: false })
    message?: string;

    @ApiProperty({ description: 'Error message if operation failed', required: false })
    error?: string;
}
