import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NodeManagementService } from './node-management.service';
import { RegisterNodeDto } from './dto/register-node.dto';
import { PulseDto } from './dto/pulse.dto';
import { NodeResponseDto } from './dto/node-response.dto';

@ApiTags('nodes')
@Controller('nodes')
export class NodeManagementController {
  constructor(private readonly nodeManagementService: NodeManagementService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new VPN node',
    description:
      'Adds a new node to the fleet. Requires mTLS or API Key authentication.',
  })
  @ApiResponse({
    status: 201,
    description: 'Node successfully registered',
    type: NodeResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid node data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials',
  })
  async register(@Body() dto: RegisterNodeDto): Promise<NodeResponseDto> {
    return this.nodeManagementService.registerNode(dto);
  }

  @Post('pulse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit node heartbeat and metrics',
    description:
      'High-frequency endpoint for nodes to report health metrics. Updates node score in Redis.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pulse successfully processed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid pulse data',
  })
  @ApiResponse({
    status: 404,
    description: 'Node not found',
  })
  async pulse(@Body() dto: PulseDto): Promise<{ success: boolean }> {
    return this.nodeManagementService.processPulse(dto);
  }
}
