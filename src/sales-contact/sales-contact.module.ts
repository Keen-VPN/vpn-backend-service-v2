import { Module } from '@nestjs/common';
import { SalesContactService } from './sales-contact.service';
import { SalesContactController } from './sales-contact.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [SalesContactController],
  providers: [SalesContactService],
  exports: [SalesContactService],
})
export class SalesContactModule {}
