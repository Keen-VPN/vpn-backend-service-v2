import { Module } from '@nestjs/common';
import { AccountController, AccountPaymentsController } from './account.controller';
import { AccountService } from './account.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccountController, AccountPaymentsController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}

