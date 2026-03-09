import { Module } from '@nestjs/common';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';

@Module({
  controllers: [RedemptionController],
  providers: [RedemptionService],
})
export class RedemptionModule {}
