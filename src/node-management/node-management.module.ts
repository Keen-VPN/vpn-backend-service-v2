import { Module } from '@nestjs/common';
import { NodeManagementController } from './node-management.controller';
import { NodeManagementService } from './node-management.service';

@Module({
  controllers: [NodeManagementController],
  providers: [NodeManagementService],
  exports: [NodeManagementService],
})
export class NodeManagementModule {}
