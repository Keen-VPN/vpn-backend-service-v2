import { Module } from '@nestjs/common';
import { AllocationService } from './allocation.service';

@Module({
  providers: [AllocationService],
  exports: [AllocationService],
})
export class AllocationModule {}
