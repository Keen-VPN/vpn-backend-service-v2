import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  UseGuards,
  Get,
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
  @ApiOperation({
    summary: 'Record a VPN connection session',
    description:
      'Records a session identified by client_session_id. User identity is from the Authorization Bearer token when present; no user_id or email in the body.',
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
    @Body() sessionDto: ConnectionSessionDto,
  ): Promise<SuccessResponseDto> {
    return this.connectionService.recordSession(sessionDto);
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
}
