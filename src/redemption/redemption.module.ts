import { Module } from '@nestjs/common';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { VPNConfigModule } from '../config/vpn-config.module';
import { CryptoModule } from '../auth/crypto/crypto.module';
import { RedisModule } from '../redis/redis.module'; // Updated path

@Module({
  imports: [VPNConfigModule, CryptoModule, RedisModule],
  controllers: [RedemptionController],
  providers: [RedemptionService],
})
export class RedemptionModule {}
