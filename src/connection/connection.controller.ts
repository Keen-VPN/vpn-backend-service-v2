import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  UseGuards,
  Get,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ConnectionService } from './connection.service';
import { ConnectionSessionDto } from '../common/dto/connection-session.dto';
import { SuccessResponseDto } from '../common/dto/response/success.response.dto';
import { Throttle } from '@nestjs/throttler';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  LongestSessionResponseDto,
  UpdateLongestSessionDto,
} from '../common/dto/user-longest-session.dto';

@ApiTags('Connection')
@Controller('connection')
export class ConnectionController {
  constructor(
    @Inject(ConnectionService)
    private readonly connectionService: ConnectionService,
  ) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Record a VPN connection session',
    description:
      'Records a session identified by client_session_id. User identity is resolved from the Authorization Bearer token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session recorded successfully',
    type: SuccessResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiBody({ type: ConnectionSessionDto })
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async recordSession(
    @CurrentUser() user: { uid: string },
    @Body() sessionDto: ConnectionSessionDto,
  ): Promise<SuccessResponseDto> {
    return this.connectionService.recordSession(sessionDto, user.uid);
  }

  @Post('metrics/longest-session')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update longest session metric for authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Longest session updated',
    type: LongestSessionResponseDto,
  })
  @ApiBody({ type: UpdateLongestSessionDto })
  async updateLongestSession(
    @CurrentUser() user: { uid: string },
    @Body() body: UpdateLongestSessionDto,
  ) {
    return this.connectionService.upsertUserLongestSession(
      user.uid,
      body.duration_seconds,
    );
  }

  @Get('metrics/longest-session')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get longest session metric for authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Longest session fetched',
    type: LongestSessionResponseDto,
  })
  async getLongestSession(@CurrentUser() user: { uid: string }) {
    return this.connectionService.getUserLongestSession(user.uid);
  }

  @Get('stats')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get connection aggregate statistics',
    description:
      'Returns total sessions, duration, bytes transferred and platform breakdown.',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection stats fetched',
  })
  async getConnectionStats(@CurrentUser() user: { uid: string }) {
    return this.connectionService.getConnectionStats(user.uid);
  }

  // Backward-compatible route for older clients. `identifier` is ignored; stats are always
  // for the authenticated user (JWT) to avoid leaking data by path.
  @Get('stats/:identifier')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get connection aggregate statistics (legacy path)',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection stats fetched',
  })
  async getConnectionStatsLegacy(
    @CurrentUser() user: { uid: string },
    @Param('identifier') identifier: string,
  ) {
    void identifier;
    return this.connectionService.getConnectionStats(user.uid);
  }

  @Get('sessions')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get recent connection sessions',
    description: 'Returns paginated recent sessions in descending time order.',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection sessions fetched',
  })
  async getConnectionSessions(
    @CurrentUser() user: { uid: string },
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.connectionService.getConnectionSessions(
      user.uid,
      limit,
      offset,
    );
  }

  // Backward-compatible route for older clients.
  @Get('sessions/:identifier')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get recent connection sessions (legacy path)',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection sessions fetched',
  })
  async getConnectionSessionsLegacy(
    @CurrentUser() user: { uid: string },
    @Param('identifier') identifier: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    void identifier;
    return this.connectionService.getConnectionSessions(
      user.uid,
      limit,
      offset,
    );
  }
}
