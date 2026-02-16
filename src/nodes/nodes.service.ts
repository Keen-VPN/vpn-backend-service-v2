import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { RegisterNodeDto } from './dto/register-node.dto';
import { NodeHeartbeatDto } from './dto/node-heartbeat.dto';

@Injectable()
export class NodesService {
  constructor(private prisma: PrismaService) {}

  async register(dto: RegisterNodeDto) {
    try {
      const node = await this.prisma.node.upsert({
        where: { publicKey: dto.public_key },
        update: {
          region: dto.region,
          ip: dto.ip,
          name: dto.name,
          status: 'ONLINE',
          lastHeartbeat: new Date(),
        },
        create: {
          publicKey: dto.public_key,
          region: dto.region,
          ip: dto.ip,
          name: dto.name,
          status: 'ONLINE',
          lastHeartbeat: new Date(),
        },
      });

      SafeLogger.info('Node registered/updated', {
        id: node.id,
        publicKey: node.publicKey,
        region: node.region,
      });

      return node;
    } catch (error) {
      SafeLogger.error('Error registering node', error);
      throw error;
    }
  }

  async heartbeat(dto: NodeHeartbeatDto) {
    try {
      const node = await this.prisma.node.findUnique({
        where: { publicKey: dto.public_key },
      });

      if (!node) {
        throw new NotFoundException(
          `Node with public key ${dto.public_key} not found`,
        );
      }

      await this.prisma.node.update({
        where: { id: node.id },
        data: {
          lastHeartbeat: new Date(),
          status: 'ONLINE',
        },
      });

      // Fetch peers for this node
      const clients = await this.prisma.nodeClient.findMany({
        where: { nodeId: node.id },
        include: {
          user: true,
        },
      });

      const peers = clients.map((c) => ({
        public_key: c.user.id, // Placeholder: assuming user ID is related to their WG public key or similar
        allowed_ips: c.allowedIps,
      }));

      return {
        status: 'ok',
        peers: peers,
        instructions: {}, // Future: add commands like 'upgrade', 'restart'
      };
    } catch (error) {
      SafeLogger.error('Error processing node heartbeat', error);
      throw error;
    }
  }

  async getActiveNodesInRegion(region: string) {
    return this.prisma.node.findMany({
      where: {
        region: region,
        status: 'ONLINE',
        lastHeartbeat: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Seen in last 5 minutes
        },
      },
    });
  }
}
