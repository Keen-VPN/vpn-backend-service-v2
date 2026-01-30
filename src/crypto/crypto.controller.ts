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
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Post('vpn-token')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  async signBlindedToken(
    @Body() vpnTokenDto: VpnTokenDto,
    @CurrentUser() user: any,
  ) {
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

