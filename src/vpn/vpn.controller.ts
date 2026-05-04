import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VpnSessionUpsertDto } from './dto/vpn-session-upsert.dto';
import { VpnSessionService } from './vpn-session.service';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Vpn')
@Controller('vpn')
export class VpnController {
  constructor(
    @Inject(VpnSessionService)
    private readonly vpnSessionService: VpnSessionService,
  ) {}

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upsert extension-reported VPN tunnel session',
    description:
      'Requires Bearer session token. Idempotent on (user, id). Accepts partial rows (null endAt).',
  })
  @ApiResponse({ status: 200, description: 'Upserted' })
  @ApiResponse({ status: 400, description: 'Invalid timestamps' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async upsertSession(
    @CurrentUser() user: { uid: string },
    @Body() body: VpnSessionUpsertDto,
  ) {
    return this.vpnSessionService.upsertSession(user.uid, body);
  }
}
