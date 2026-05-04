import { Module } from '@nestjs/common';
import { VpnController } from './vpn.controller';
import { VpnSessionService } from './vpn-session.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VpnController],
  providers: [VpnSessionService],
  exports: [VpnSessionService],
})
export class VpnModule {}
