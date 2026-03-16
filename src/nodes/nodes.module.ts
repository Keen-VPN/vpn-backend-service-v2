import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}
