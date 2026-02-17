import { Module } from '@nestjs/common';
import { ConnectionController } from './connection.controller';
import { ConnectionService } from './connection.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '../crypto/crypto.module';
import { NodesModule } from '../nodes/nodes.module';

@Module({
  imports: [PrismaModule, AuthModule, CryptoModule, NodesModule],
  controllers: [ConnectionController],
  providers: [ConnectionService],
  exports: [ConnectionService],
})
export class ConnectionModule {}
