import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiStandardResponse, ApiStandardErrorResponse } from '../common/decorators/api-responses.decorator';
import { AccountDeletionResponseDto } from '../common/dto/response/user.response.dto';
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
import {
  AuthResponseDto,
  VerifySessionResponseDto,
  LogoutResponseDto,
} from '../common/dto/response/auth.response.dto';

@ApiTags('Auth')
@Controller('auth')
@ApiStandardErrorResponse()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountService: AccountService,
  ) { }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with firebase ID token' })
  @ApiStandardResponse({ status: 200, description: 'Login successful', type: AuthResponseDto })
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.idToken);
  }

  @Post('google/signin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with Google' })
  @ApiStandardResponse({ status: 200, description: 'Google sign-in successful', type: AuthResponseDto })
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
  @ApiOperation({ summary: 'Sign in with Apple' })
  @ApiStandardResponse({ status: 200, description: 'Apple sign-in successful', type: AuthResponseDto })
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
  @ApiOperation({ summary: 'Verify session token' })
  @ApiStandardResponse({ status: 200, description: 'Session verified', type: VerifySessionResponseDto })
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  @ApiStandardResponse({ status: 200, description: 'Logout successful', type: LogoutResponseDto })
  async logout(@CurrentUser() user: any) {
    const userId = user.uid;
    return this.authService.logout(userId);
  }

  @Delete('delete-account')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user account' })
  @ApiStandardResponse({ status: 200, description: 'Account deleted successfully', type: AccountDeletionResponseDto })
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

