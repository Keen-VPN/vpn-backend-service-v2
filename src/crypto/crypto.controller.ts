import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CryptoService } from './crypto.service';
import { VpnTokenDto } from '../common/dto/vpn-token.dto';
import {
  BlindedTokenSignatureResponseDto,
  PublicKeyResponseDto,
} from '../common/dto/response/crypto.response.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { SubscriptionService } from '../subscription/subscription.service';
@ApiTags('Crypto')
@Controller('auth')
export class CryptoController {
  constructor(
    private readonly cryptoService: CryptoService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post('vpn-token')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign blinded VPN token' })
  @ApiResponse({
    status: 200,
    description: 'Token signed successfully',
    type: BlindedTokenSignatureResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Subscription required',
  })
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  async signBlindedToken(
    @Req() req: Request,
    @Body() vpnTokenDto: VpnTokenDto,
  ) {
    const body = req.body as { sessionToken?: string } | undefined;
    const tokenFromBody =
      body && typeof body.sessionToken === 'string' ? body.sessionToken : null;
    const authHeader = req.headers.authorization;
    const tokenFromHeader =
      typeof authHeader === 'string'
        ? authHeader.replace(/^Bearer\s+/i, '')
        : '';
    const sessionToken = tokenFromBody ?? tokenFromHeader ?? '';

    const status =
      await this.subscriptionService.getStatusWithSession(sessionToken);
    const hasAccess =
      status?.hasActiveSubscription || (status?.trial?.trialActive ?? false);
    if (!hasAccess) {
      throw new ForbiddenException(
        'Active subscription or trial required to connect to VPN',
      );
    }

    const signature = await this.cryptoService.signBlindedToken(
      vpnTokenDto.blindedToken,
    );
    return { signature };
  }

  @Get('vpn-token/public-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get VPN public key' })
  @ApiResponse({
    status: 200,
    description: 'Public key returned',
    type: PublicKeyResponseDto,
  })
  getPublicKey() {
    return { publicKey: this.cryptoService.getPublicKey() };
  }
}
