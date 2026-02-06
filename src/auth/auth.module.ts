import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseConfig } from '../config/firebase.config';
import { AppleTokenVerifierService } from './apple-token-verifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountModule } from '../account/account.module';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { TokenController } from './token.controller';
import { CryptoModule } from './crypto/crypto.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AccountModule),
    forwardRef(() => CryptoModule),
  ],
  controllers: [AuthController, TokenController],
  providers: [
    AuthService,
    FirebaseConfig,
    AppleTokenVerifierService,
    SessionAuthGuard,
  ],
  exports: [
    AuthService,
    FirebaseConfig,
    AppleTokenVerifierService,
    SessionAuthGuard,
  ],
})
export class AuthModule {}
