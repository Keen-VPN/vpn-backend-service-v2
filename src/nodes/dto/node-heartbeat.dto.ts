import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NodeHeartbeatDto {
  @ApiProperty({
    description: 'The Public Key of the WireGuard interface',
    example: 'abcd...xyz',
  })
  @IsString()
  @IsNotEmpty()
  public_key: string;

  @ApiPropertyOptional({
    description: 'System metrics reported by the node',
  })
  @IsObject()
  @IsOptional()
  metrics?: {
    cpu_usage: number;
    ram_usage: number;
    bandwidth_stats?: any;
  };
}
