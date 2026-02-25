import { Module } from '@nestjs/common';
import { VPNConfigController } from './vpn-config.controller';
import { VPNConfigService } from './vpn-config.service';
import { ConfigModule } from './config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [ConfigModule, PrismaModule, CryptoModule],
  controllers: [VPNConfigController],
  providers: [VPNConfigService],
  exports: [VPNConfigService],
})
export class VPNConfigModule {}
