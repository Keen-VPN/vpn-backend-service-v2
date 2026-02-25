import { Controller, Post, Body, UseGuards, Inject } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NodesService } from './nodes.service';
import { RegisterNodeDto } from './dto/register-node.dto';
import { NodeHeartbeatDto } from './dto/node-heartbeat.dto';
import {
  NodeResponseDto,
  NodeHeartbeatResponseDto,
} from '../common/dto/response/nodes.response.dto';
import { NodeAuthGuard } from '../auth/guards/node-auth.guard';

@ApiTags('Nodes')
@ApiBearerAuth()
@UseGuards(NodeAuthGuard)
@Controller('nodes')
export class NodesController {
  constructor(
    @Inject(NodesService)
    private readonly nodesService: NodesService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register or update a VPN exit node' })
  @ApiResponse({
    status: 201,
    description: 'Node registered successfully',
    type: NodeResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async register(@Body() dto: RegisterNodeDto) {
    return this.nodesService.register(dto);
  }

  @Post('heartbeat')
  @ApiOperation({
    summary: 'Report node health and receive status confirmation',
  })
  @ApiResponse({
    status: 200,
    description: 'Heartbeat processed successfully',
    type: NodeHeartbeatResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async heartbeat(@Body() dto: NodeHeartbeatDto) {
    return this.nodesService.heartbeat(dto);
  }
}
