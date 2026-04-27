import { Module, forwardRef } from '@nestjs/common';
import {
  AccountController,
  AccountPaymentsController,
} from './account.controller';
import { AccountService } from './account.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), EmailModule],
  controllers: [AccountController, AccountPaymentsController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
