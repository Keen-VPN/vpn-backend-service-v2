import { Controller, Post, Body } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { RegisterNodeDto } from './dto/register-node.dto';
import { NodeHeartbeatDto } from './dto/node-heartbeat.dto';
// import { AdminGuard } from '../auth/guards/admin.guard'; // Assume an admin guard exists for registration

@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Post('register')
  // @UseGuards(AdminGuard) // Future: secure node registration
  async register(@Body() dto: RegisterNodeDto) {
    return this.nodesService.register(dto);
  }

  @Post('heartbeat')
  async heartbeat(@Body() dto: NodeHeartbeatDto) {
    return this.nodesService.heartbeat(dto);
  }
}
