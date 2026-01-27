import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationService } from '../notification/notification.service';
import { NodeResponseDto } from './dto/node-response.dto';
import { PulseDto } from './dto/pulse.dto';
import { RegisterNodeDto } from './dto/register-node.dto';
import { NodeStatus } from './interfaces/node.interface';

@Injectable()
export class NodeManagementService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly notificationService: NotificationService,
  ) {}

  async registerNode(dto: RegisterNodeDto): Promise<NodeResponseDto> {
    try {
      const node = await this.prismaService.node.create({
        data: {
          ipAddress: dto.ipAddress,
          publicKey: dto.publicKey,
          region: dto.region,
          city: dto.city,
          country: dto.country,
          capacity: dto.capacity,
          status: 'active',
          currentConnections: 0,
          cpuUsage: 0,
          bandwidthUsage: 0,
        },
      });

      await this.redisService.zadd(`nodes:${dto.region}`, 0, node.id);

      await this.notificationService.notifyNodeRegistered(node.id, dto.region);

      return {
        id: node.id,
        ipAddress: node.ipAddress,
        publicKey: node.publicKey,
        region: node.region,
        status: node.status as NodeStatus,
        createdAt: node.createdAt,
      };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new BadRequestException(
          'Node with this public key already exists',
        );
      }
      throw error;
    }
  }

  async processPulse(dto: PulseDto): Promise<{ success: boolean }> {
    const node = await this.prismaService.node.findUnique({
      where: { id: dto.nodeId },
    });

    if (!node) {
      throw new BadRequestException('Node not found');
    }

    if (node.status !== 'active') {
      throw new BadRequestException('Node is not active');
    }

    await this.prismaService.node.update({
      where: { id: dto.nodeId },
      data: {
        cpuUsage: dto.cpuUsage,
        bandwidthUsage: dto.bandwidthUsage,
        currentConnections: dto.connectionCount,
        lastHeartbeat: new Date(),
      },
    });

    const score = this.calculateNodeScore(
      dto.cpuUsage,
      dto.bandwidthUsage,
      dto.connectionCount,
    );

    await this.redisService.zadd(`nodes:${node.region}`, score, dto.nodeId);

    const HIGH_LOAD_THRESHOLD = 90;
    if (dto.cpuUsage > HIGH_LOAD_THRESHOLD) {
      await this.notificationService.notifyHighLoad(
        dto.nodeId,
        dto.cpuUsage,
        HIGH_LOAD_THRESHOLD,
      );
    }

    return { success: true };
  }

  private calculateNodeScore(
    cpuUsage: number,
    bandwidthUsage: number,
    connectionCount: number,
  ): number {
    return cpuUsage * 0.4 + bandwidthUsage * 0.3 + connectionCount * 0.3;
  }

  async detectDeadNodes(): Promise<void> {
    // TODO:
    // 1. Query Redis for nodes with stale heartbeats (e.g., > 2 minutes)
    // 2. Remove dead nodes from Redis "Available" pool
    // 3. Update node status in Postgres to INACTIVE
    // 4. Trigger notification to Slack #ops-infrastructure
  }
}
