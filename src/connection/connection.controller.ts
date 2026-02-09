import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConnectionService } from './connection.service';
import { ConnectionSessionDto } from '../common/dto/connection-session.dto';
import { SuccessResponseDto } from '../common/dto/response/success.response.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Connection')
@Controller('connection')
export class ConnectionController {
  constructor(private readonly connectionService: ConnectionService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record an anonymous VPN session' })
  @ApiResponse({
    status: 200,
    description: 'Session recorded successfully',
    type: SuccessResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async recordSession(
    @Body() sessionDto: ConnectionSessionDto,
  ): Promise<SuccessResponseDto> {
    return this.connectionService.recordSession(sessionDto);
  }
}
