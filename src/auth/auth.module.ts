import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseConfig } from '../config/firebase.config';
import { AppleTokenVerifierService } from './apple-token-verifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountModule } from '../account/account.module';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { OptionalSessionGuard } from './guards/optional-session.guard';
import { LinkProviderService } from './link-provider.service';
import { LinkProviderController } from './link-provider.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => AccountModule)],
  controllers: [AuthController, LinkProviderController],
  providers: [
    AuthService,
    FirebaseConfig,
    AppleTokenVerifierService,
    SessionAuthGuard,
    OptionalSessionGuard,
    LinkProviderService,
  ],
  exports: [
    AuthService,
    FirebaseConfig,
    AppleTokenVerifierService,
    SessionAuthGuard,
    OptionalSessionGuard,
    LinkProviderService,
  ],
})
export class AuthModule {}
