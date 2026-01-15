import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from '../common/dto/login.dto';
import { GoogleSignInDto } from '../common/dto/google-signin.dto';
import { AppleSignInDto } from '../common/dto/apple-signin.dto';
import { VerifySessionDto } from '../common/dto/verify-session.dto';
import { Delete } from '@nestjs/common';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { AccountService } from '../account/account.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountService: AccountService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.idToken);
  }

  @Post('google/signin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async googleSignIn(@Body() googleSignInDto: GoogleSignInDto) {
    return this.authService.googleSignIn(
      googleSignInDto.idToken,
      googleSignInDto.deviceFingerprint,
      googleSignInDto.devicePlatform,
    );
  }

  @Post('apple/signin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async appleSignIn(@Body() appleSignInDto: AppleSignInDto) {
    return this.authService.appleSignIn(
      appleSignInDto.identityToken,
      appleSignInDto.userIdentifier,
      appleSignInDto.email || '',
      appleSignInDto.fullName || '',
      appleSignInDto.transactionIds,
      appleSignInDto.deviceFingerprint,
      appleSignInDto.devicePlatform,
    );
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute for verification
  async verifySession(@Body() verifySessionDto: VerifySessionDto) {
    return this.authService.verifySession(
      verifySessionDto.sessionToken,
      verifySessionDto.deviceFingerprint,
      verifySessionDto.devicePlatform,
    );
  }

  @Post('logout')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: any) {
    const userId = user.uid;
    return this.authService.logout(userId);
  }

  @Delete('delete-account')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 1, ttl: 3600000 } }) // 1 request per hour
  async deleteAccount(@CurrentUser() user: any) {
    const userId = user.uid; // SessionAuthGuard sets uid
    const result = await this.accountService.deleteAccount(userId);
    return {
      message: 'Account deleted successfully',
      ...result,
    };
  }
}

