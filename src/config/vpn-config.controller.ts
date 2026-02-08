import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiBody,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { VPNConfigService } from './vpn-config.service';
import { VpnCredentialDto } from '../common/dto/vpn-credential.dto';
import {
  VPNConfigResponseDto,
  VPNCredentialsResponseDto,
} from '../common/dto/response/config.response.dto';
import { Throttle } from '@nestjs/throttler';
import { SafeLogger } from '../common/utils/logger.util';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { SubscriptionService } from '../subscription/subscription.service';

@ApiTags('Config')
@Controller('config')
export class VPNConfigController {
  constructor(
    private readonly vpnConfigService: VPNConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('vpn')
  @UseGuards(OptionalSessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-config-client',
    description: 'Client token for configuration',
    required: false,
  })
  @ApiOperation({ summary: 'Get VPN configuration' })
  @ApiResponse({
    status: 200,
    description: 'VPN configuration returned',
    type: VPNConfigResponseDto,
  })
  @ApiResponse({ status: 500, description: 'VPN config not available' })
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async getVPNConfig(
    @Req() req: Request & { user?: { uid: string } },
    @Headers('x-config-client') clientToken: string | undefined,
    @Res() res: Response,
  ) {
    const user = req.user;
    const sessionToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    // Determine if we would include credentials (auth + subscription)
    let wouldIncludeCredentials = false;
    if (user && sessionToken) {
      try {
        const status =
          await this.subscriptionService.getStatusWithSession(sessionToken);
        wouldIncludeCredentials =
          status?.hasActiveSubscription ||
          (status?.trial?.trialActive ?? false);
      } catch {
        wouldIncludeCredentials = false;
      }
    }

    // Never use 304 - response body varies by auth (credentials included or stripped).
    // Client cannot safely reuse a cached copy across auth state changes.
    const result = await this.vpnConfigService.getVPNConfig(
      undefined, // skip ETag check - always return full config
      clientToken,
    );

    if (!result.config) {
      return res.status(500).json({ error: 'VPN config not available' });
    }

    const configToSend = wouldIncludeCredentials
      ? result.config
      : this.vpnConfigService.stripCredentials(result.config);

    SafeLogger.info('Sending VPN config', {
      version: configToSend.version,
      serversCount: configToSend.servers?.length || 0,
      credentialsIncluded: (configToSend as { credentials?: unknown[] })
        .credentials?.length
        ? true
        : false,
    });

    // Avoid Express automatic ETag + 304 behavior for this endpoint.
    // Response body varies by auth (credentials included or stripped), so conditional GET is unsafe.
    res.status(200);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(configToSend));
  }

  @Post('vpn/credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate VPN credentials' })
  @ApiResponse({
    status: 200,
    description: 'VPN credentials generated',
    type: VPNCredentialsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiBody({ type: VpnCredentialDto })
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
