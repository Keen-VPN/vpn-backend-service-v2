import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RedemptionService } from './redemption.service';
import { RedeemTokenDto } from './dto/redeem-token.dto';
import { VPNConfigResponseDto } from './dto/vpn-config-response.dto';

@ApiTags('vpn')
@Controller('vpn')
export class RedemptionController {
  constructor(private readonly redemptionService: RedemptionService) {}

  @Post('config')
  @ApiOperation({
    summary: 'Redeem token for VPN configuration',
    description:
      'Exchanges a valid anonymous token for WireGuard configuration. Includes double-spend protection.',
  })
  @ApiResponse({
    status: 200,
    description: 'VPN configuration successfully issued',
    type: VPNConfigResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or signature',
  })
  @ApiResponse({
    status: 409,
    description: 'Token already used (double-spend detected)',
  })
  @ApiResponse({
    status: 503,
    description: 'No available nodes in the requested region',
  })
  async redeemToken(
    @Body() dto: RedeemTokenDto,
  ): Promise<VPNConfigResponseDto> {
    return this.redemptionService.redeemToken(dto);
  }
}
