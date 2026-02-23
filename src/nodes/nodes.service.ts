import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { RegisterNodeDto } from './dto/register-node.dto';
import { NodeHeartbeatDto } from './dto/node-heartbeat.dto';

@Injectable()
export class NodesService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async register(dto: RegisterNodeDto) {
    try {
      const node = await this.prisma.node.upsert({
        where: { publicKey: dto.publicKey },
        update: {
          region: dto.region,
          ip: dto.publicIp,
          name: dto.name,
          status: dto.status,
          lastHeartbeat: new Date(),
        },
        create: {
          publicKey: dto.publicKey,
          region: dto.region,
          ip: dto.publicIp,
          name: dto.name,
          status: dto.status,
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
        where: { publicKey: dto.publicKey },
      });

      if (!node) {
        throw new NotFoundException(
          `Node with public key ${dto.publicKey} not found`,
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
        publicKey: c.user.id, // Placeholder: assuming user ID is related to their WG public key or similar
        allowedIps: c.allowedIps,
      }));

      return {
        status: 'ok',
        peers: peers,
        instructions: {
          drain: node.status === 'DRAINING',
        },
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
