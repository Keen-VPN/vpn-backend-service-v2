import { ApiProperty } from '@nestjs/swagger';

export class TrialStatusDto {
    @ApiProperty({ example: true, description: 'Is trial active' })
    active: boolean;

    @ApiProperty({ example: 'premium', description: 'Trial tier' })
    tier: string;

    @ApiProperty({ example: '2023-01-01T00:00:00.000Z', description: 'Trial start date', required: false })
    startsAt: string | null;

    @ApiProperty({ example: '2023-01-08T00:00:00.000Z', description: 'Trial end date', required: false })
    endsAt: string | null;

    @ApiProperty({ example: 7, description: 'Days remaining in trial', required: false })
    daysRemaining: number | null;
}
