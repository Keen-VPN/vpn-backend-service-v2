import {
  Controller,
  Post,
  Body,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { RedemptionService } from './redemption.service';
import { RedeemTokenDto } from './dto/redeem-token.dto';

@ApiTags('Redemption')
@Controller('redemption')
export class RedemptionController {
  constructor(private readonly redemptionService: RedemptionService) {}

  @Post('redeem')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Strict limit for redemption
  @ApiOperation({ summary: 'Redeem a blinded token for VPN credentials' })
  @ApiResponse({
    status: 201,
    description: 'Token successfully redeemed',
    schema: { example: { username: 'user', password: 'password' } },
  })
  @ApiResponse({ status: 400, description: 'Invalid token or signature' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiBody({ type: RedeemTokenDto })
  @UsePipes(new ValidationPipe({ transform: true }))
  async redeemToken(@Body() redeemDto: RedeemTokenDto) {
    return this.redemptionService.redeemToken(redeemDto);
  }
}
