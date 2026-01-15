import { Module } from '@nestjs/common';
import { VPNConfigController } from './vpn-config.controller';
import { VPNConfigService } from './vpn-config.service';
import { ConfigModule } from './config.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [VPNConfigController],
  providers: [VPNConfigService],
  exports: [VPNConfigService],
})
export class VPNConfigModule {}

