import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { NodeManagementModule } from './node-management/node-management.module';
import { RedemptionModule } from './redemption/redemption.module';
import { AllocationModule } from './allocation/allocation.module';
import { LocationModule } from './location/location.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    NodeManagementModule,
    RedemptionModule,
    AllocationModule,
    LocationModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
