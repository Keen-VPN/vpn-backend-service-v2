import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { VPNConfigService } from './vpn-config.service';
import { VpnCredentialDto } from '../common/dto/vpn-credential.dto';
import { Throttle } from '@nestjs/throttler';
import { SafeLogger } from '../common/utils/logger.util';

@Controller('config')
export class VPNConfigController {
  constructor(private readonly vpnConfigService: VPNConfigService) {}

  @Get('vpn')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async getVPNConfig(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('x-config-client') clientToken: string | undefined,
    @Res() res: Response,
  ) {
    const etag = ifNoneMatch?.replace(/^"|"$/g, ''); // Remove quotes if present

    const result = await this.vpnConfigService.getVPNConfig(etag, clientToken);

    if (result.status === 'not-modified') {
      return res.status(304).end();
    }

    // Set ETag header
    if (result.etag) {
      res.setHeader('ETag', `"${result.etag}"`);
    }

    // Ensure config structure is valid before sending
    if (!result.config) {
      return res.status(500).json({ error: 'VPN config not available' });
    }

    // Log config structure for debugging
    SafeLogger.info('Sending VPN config', {
      version: result.config.version,
      serversCount: result.config.servers?.length || 0,
      credentialsCount: result.config.credentials?.length || 0,
    });

    return res.json(result.config);
  }

  @Post('vpn/credentials')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 50, ttl: 60000 } }) // 50 requests per minute
  async getVPNCredentials(@Body() credentialDto: VpnCredentialDto) {
    const credentials =
      await this.vpnConfigService.generateTokenBasedCredentials(
        credentialDto.token,
        credentialDto.signature,
        credentialDto.serverId,
      );

    SafeLogger.info('VPN credentials generated', {
      serverId: credentialDto.serverId,
      // Never log token or signature
    });

    return credentials;
  }
}
