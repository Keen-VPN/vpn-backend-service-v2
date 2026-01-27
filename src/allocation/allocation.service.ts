import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Node, NodeStatus } from '../node-management/interfaces/node.interface';

@Injectable()
export class AllocationService {
  private readonly HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async selectOptimalNode(region?: string): Promise<Node | null> {
    const redisKey = region ? `nodes:${region}` : 'nodes:global';

    const nodeIds = await this.redisService.zrange(redisKey, 0, 0);

    if (!nodeIds || nodeIds.length === 0) {
      return null;
    }

    const node = await this.prismaService.node.findUnique({
      where: { id: nodeIds[0] },
    });

    if (!node) {
      return null;
    }

    if (node.status !== 'active') {
      return null;
    }

    const heartbeatAge = Date.now() - new Date(node.lastHeartbeat).getTime();
    if (heartbeatAge > this.HEARTBEAT_THRESHOLD_MS) {
      return null;
    }

    return {
      id: node.id,
      ipAddress: node.ipAddress,
      publicKey: node.publicKey,
      region: node.region,
      city: node.city ?? undefined,
      country: node.country,
      status: node.status as NodeStatus,
      capacity: node.capacity,
      currentConnections: node.currentConnections,
      cpuUsage: node.cpuUsage,
      bandwidthUsage: node.bandwidthUsage,
      lastHeartbeat: new Date(node.lastHeartbeat),
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
    };
  }
}
