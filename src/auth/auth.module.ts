import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseConfig } from '../config/firebase.config';
import { AppleTokenVerifierService } from './apple-token-verifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountModule } from '../account/account.module';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { OptionalSessionGuard } from './guards/optional-session.guard';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AccountModule), EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    FirebaseConfig,
    AppleTokenVerifierService,
    SessionAuthGuard,
    OptionalSessionGuard,
  ],
  exports: [
    AuthService,
    FirebaseConfig,
    AppleTokenVerifierService,
    SessionAuthGuard,
    OptionalSessionGuard,
  ],
})
export class AuthModule {}
