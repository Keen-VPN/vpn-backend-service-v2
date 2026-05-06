import { ApiProperty } from '@nestjs/swagger';
import { AdminUserStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

export class DisableAdminUserDto {
  @ApiProperty({ enum: [AdminUserStatus.DISABLED] })
  @IsIn([AdminUserStatus.DISABLED])
  status!: AdminUserStatus;
}
