import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class IpAddressClickEventDto {
  @ApiPropertyOptional({
    type: 'string',
    example: 'ios',
    description: 'Client platform that triggered the event',
  })
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiPropertyOptional({
    type: 'string',
    example: 'United States · Virginia',
    description: 'Selected VPN server location',
  })
  @IsString()
  @IsOptional()
  server_location?: string;

  @ApiPropertyOptional({
    type: 'string',
    example: 'connected',
    description: 'VPN connection status when the event fired',
  })
  @IsString()
  @IsOptional()
  connection_status?: string;

  @ApiPropertyOptional({
    type: 'boolean',
    example: true,
    description:
      'Whether a non-empty IP address was visible. Raw IP is intentionally not collected.',
  })
  @IsBoolean()
  @IsOptional()
  ip_address_present?: boolean;

  @ApiPropertyOptional({
    type: 'string',
    example: '1.0.0',
    description: 'Client app version',
  })
  @IsString()
  @IsOptional()
  app_version?: string;
}
