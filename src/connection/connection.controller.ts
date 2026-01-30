import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConnectionService } from './connection.service';
import { ConnectionSessionDto } from '../common/dto/connection-session.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('connection')
export class ConnectionController {
  constructor(private readonly connectionService: ConnectionService) {}

  @Post('session')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async recordSession(
    @Body() sessionDto: ConnectionSessionDto,
    @CurrentUser() user: any,
  ) {
    return this.connectionService.recordSession(user.uid, sessionDto);
  }

  @Get('sessions/:email')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getSessions(
    @Param('email') email: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Verify user owns this email
    if (user.email !== email) {
      throw new UnauthorizedException('Cannot access other user sessions');
    }

    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    return this.connectionService.getSessions(email, limitNum, offsetNum);
  }

  @Get('stats/:email')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getStats(
    @Param('email') email: string,
    @CurrentUser() user: any,
  ) {
    // Verify user owns this email
    if (user.email !== email) {
      throw new UnauthorizedException('Cannot access other user stats');
    }

    return this.connectionService.getStats(email);
  }
}

