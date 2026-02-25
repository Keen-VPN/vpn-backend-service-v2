import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NodeHeartbeatDto {
  @ApiProperty({
    description: 'The Public Key of the WireGuard interface',
    example: 'abcd...xyz',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @ApiPropertyOptional({
    description: 'System metrics reported by the node',
    example: {
      cpu_usage: 0.15,
      ram_usage: 0.45,
      bandwidth_stats: { rx: 1234567, tx: 7654321 },
    },
  })
  @IsObject()
  @IsOptional()
  metrics?: {
    cpu_usage: number;
    ram_usage: number;
    bandwidth_stats?: any;
  };
}
