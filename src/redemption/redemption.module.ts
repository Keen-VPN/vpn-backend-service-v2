import { Module } from '@nestjs/common';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { AllocationModule } from '../allocation/allocation.module';

@Module({
  imports: [AllocationModule],
  controllers: [RedemptionController],
  providers: [RedemptionService],
})
export class RedemptionModule {}
