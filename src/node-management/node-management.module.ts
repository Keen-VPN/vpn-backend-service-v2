import { Module } from '@nestjs/common';
import { NodeManagementController } from './node-management.controller';
import { NodeManagementService } from './node-management.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [NodeManagementController],
  providers: [NodeManagementService],
  exports: [NodeManagementService],
})
export class NodeManagementModule {}
