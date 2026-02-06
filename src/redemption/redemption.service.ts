import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { CryptoService } from '../auth/crypto/crypto.service';
import { VPNConfigService } from '../config/vpn-config.service';
import { SafeLogger } from '../common/utils/logger.util';
import { RedeemTokenDto } from './dto/redeem-token.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedemptionService {
  constructor(
    private cryptoService: CryptoService,
    private vpnConfigService: VPNConfigService,
    private redisService: RedisService,
  ) {}

  async redeemToken(redeemDto: RedeemTokenDto) {
    const { token, signature, serverId } = redeemDto;

    // 1. Verify Blind Signature
    const isValid = this.cryptoService.verifyBlindSignedToken(token, signature);
    if (!isValid) {
      SafeLogger.warn('Invalid blind token signature', {
        token: token.substring(0, 10),
      });
      throw new BadRequestException('Invalid token signature');
    }

    // 2. Check Double Spend
    const key = `spent_token:${token}`;
    const exists = await this.redisService.get(key);
    if (exists) {
      SafeLogger.warn('Double spend attempt detected', {
        token: token.substring(0, 10),
      });
      throw new BadRequestException('Token already redeemed');
    }

    // Mark as spent (1 year TTL for now, or indefinite)
    await this.redisService.set(key, 'redeemed', 60 * 60 * 24 * 365);

    // 3. Get Credentials
    return this.vpnConfigService.generateTokenBasedCredentials(
      token,
      signature,
      serverId,
    );
  }
}
