import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { VpnTokenDto } from '../common/dto/vpn-token.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Post('vpn-token')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  async signBlindedToken(@Body() vpnTokenDto: VpnTokenDto) {
    const signature = await this.cryptoService.signBlindedToken(
      vpnTokenDto.blindedToken,
    );
    return { signature };
  }

  @Get('vpn-token/public-key')
  @HttpCode(HttpStatus.OK)
  getPublicKey() {
    return { publicKey: this.cryptoService.getPublicKey() };
  }
}
