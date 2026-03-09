import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { VPNConfigService } from './vpn-config.service';
import { VpnCredentialDto } from '../common/dto/vpn-credential.dto';
import {
  ActiveNodesResponseDto,
  WireGuardCredentialsResponseDto,
} from '../common/dto/response/config.response.dto';
import { Throttle } from '@nestjs/throttler';
import { SafeLogger } from '../common/utils/logger.util';

@ApiTags('Config')
@Controller('config')
export class VPNConfigController {
  constructor(
    @Inject(VPNConfigService)
    private readonly vpnConfigService: VPNConfigService,
  ) {}

  @Get('vpn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get list of ONLINE VPN nodes' })
  @ApiResponse({
    status: 200,
    description: 'List of online nodes returned',
    type: ActiveNodesResponseDto,
  })
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async getActiveNodes() {
    const nodes = await this.vpnConfigService.getActiveNodesSimplified();
    return {
      status: 'ok',
      nodes,
    };
  }

  @Post('vpn/credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate WireGuard credentials and register client',
  })
  @ApiResponse({
    status: 200,
    description: 'VPN credentials generated and client registered on node',
    type: WireGuardCredentialsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiBody({ type: VpnCredentialDto })
  @Throttle({ default: { limit: 50, ttl: 60000 } })
  async getVPNCredentials(@Body() credentialDto: VpnCredentialDto) {
    const credentials = await this.vpnConfigService.processVpnConnection(
      credentialDto.token,
      credentialDto.signature,
      credentialDto.serverId,
      credentialDto.clientPublicKey,
    );

    SafeLogger.info('VPN connection processed', {
      serverId: credentialDto.serverId,
    });

    return credentials;
  }
}
