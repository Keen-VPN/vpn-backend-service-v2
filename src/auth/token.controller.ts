import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { CryptoService } from './crypto/crypto.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth/token')
export class TokenController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Post('sign')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED) // Changed from OK to CREATED for a successful resource creation/signing
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Strict limit
  @ApiOperation({ summary: 'Sign a blinded token' })
  @ApiResponse({
    status: 201,
    description: 'Token successfully signed',
    schema: { example: { blindedSignature: 'sig_123' } },
  })
  @ApiResponse({ status: 400, description: 'Invalid blinded token' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        blindedToken: { type: 'string', example: 'blinded_token_123' },
      },
    },
  })
  async signBlindedToken(@Body('blindedToken') blindedToken: string) {
    if (!blindedToken) {
      throw new UnauthorizedException('Invalid blinded token provided.'); // Or BadRequestException if it's just malformed
    }
    const signature = await this.cryptoService.signBlindedToken(blindedToken);
    return { blindedSignature: signature };
  }
}
