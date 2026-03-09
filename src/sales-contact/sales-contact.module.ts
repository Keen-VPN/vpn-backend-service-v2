import { Module } from '@nestjs/common';
import { SalesContactService } from './sales-contact.service';
import { SalesContactController } from './sales-contact.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SalesContactController],
  providers: [SalesContactService],
  exports: [SalesContactService],
})
export class SalesContactModule {}
