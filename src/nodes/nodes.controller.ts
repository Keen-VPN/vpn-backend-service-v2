import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NodesService } from './nodes.service';
import { RegisterNodeDto } from './dto/register-node.dto';
import { NodeHeartbeatDto } from './dto/node-heartbeat.dto';
import { NodeAuthGuard } from '../auth/guards/node-auth.guard';

@ApiTags('Nodes')
@ApiBearerAuth()
@UseGuards(NodeAuthGuard)
@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new VPN exit node' })
  @ApiResponse({ status: 201, description: 'Node registered successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async register(@Body() dto: RegisterNodeDto) {
    return this.nodesService.register(dto);
  }

  @Post('heartbeat')
  @ApiOperation({ summary: 'Report node health and receive peer updates' })
  @ApiResponse({ status: 200, description: 'Heartbeat processed successfully' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async heartbeat(@Body() dto: NodeHeartbeatDto) {
    return this.nodesService.heartbeat(dto);
  }
}
