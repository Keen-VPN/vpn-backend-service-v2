import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class NodeHeartbeatDto {
  @IsString()
  @IsNotEmpty()
  public_key: string;

  @IsObject()
  @IsOptional()
  metrics?: {
    cpu_usage: number;
    ram_usage: number;
    bandwidth_stats?: any;
  };
}
