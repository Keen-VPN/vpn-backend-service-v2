import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isIP } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { RegisterNodeDto } from './dto/register-node.dto';
import { NodeHeartbeatDto } from './dto/node-heartbeat.dto';
import { NodeStatus, Node } from '@prisma/client';
import { firstValueFrom } from 'rxjs';

interface GeoResponse {
  country_name?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  country_code?: string;
  error?: boolean;
  reason?: string;
}

@Injectable()
export class NodesService {
  private geoCache = new Map<string, { data: Partial<Node>; expiry: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(HttpService) private readonly httpService: HttpService,
  ) {}

  async register(dto: RegisterNodeDto) {
    try {
      let geoData: Partial<Node> = {};
      if (dto.publicIp) {
        geoData = await this.fetchGeoLocation(dto.publicIp);
      }

      const node = await this.prisma.node.upsert({
        where: { publicKey: dto.publicKey },
        update: {
          region: dto.region,
          ...(dto.publicIp && { ip: dto.publicIp }),
          status: dto.status as NodeStatus,
          lastHeartbeat: new Date(),
          ...geoData,
        },
        create: {
          publicKey: dto.publicKey,
          region: dto.region,
          ip: dto.publicIp || '',
          status: dto.status as NodeStatus,
          lastHeartbeat: new Date(),
          ...geoData,
        },
      });

      SafeLogger.info('Node registered/updated', {
        id: node.id,
        publicKey: node.publicKey,
        region: node.region,
        country: node.country,
        city: node.city,
      });

      return node;
    } catch (error) {
      SafeLogger.error('Error registering node', error);
      throw error;
    }
  }

  private async fetchGeoLocation(ip: string): Promise<Partial<Node>> {
    // 0. Defensive Validation: Ensure input is a valid IP format
    if (!isIP(ip)) {
      SafeLogger.warn('Invalid IP format provided for geolocation', { ip });
      return {};
    }

    // 1. Check Cache and Evict if expired
    const cached = this.geoCache.get(ip);
    if (cached) {
      if (cached.expiry > Date.now()) {
        return cached.data;
      }
      this.geoCache.delete(ip); // Evict expired entry
    }

    try {
      // 2. Secure HTTPS call
      // Switching to ipapi.co (supports HTTPS on free tier)
      const response = await firstValueFrom(
        this.httpService.get<GeoResponse>(`https://ipapi.co/${ip}/json/`, {
          timeout: 3000,
        }),
      );

      if (response.data && !response.data.error) {
        const geoData: Partial<Node> = {
          country: response.data.country_name ?? null,
          city: response.data.city ?? null,
          latitude: response.data.latitude ?? null,
          longitude: response.data.longitude ?? null,
          flagUrl: response.data.country_code
            ? `https://flagcdn.com/w40/${response.data.country_code.toLowerCase()}.png`
            : null,
        };

        // 3. Update Cache with size limit enforcement
        if (this.geoCache.size >= this.MAX_CACHE_SIZE) {
          // Simple FIFO eviction: delete first entry
          const firstKey = this.geoCache.keys().next().value as
            | string
            | undefined;
          if (firstKey) {
            this.geoCache.delete(firstKey);
          }
        }

        this.geoCache.set(ip, {
          data: geoData,
          expiry: Date.now() + this.CACHE_TTL,
        });

        return geoData;
      }
      return {};
    } catch (error) {
      SafeLogger.error(`Failed to fetch geolocation for IP ${ip}`, error);
      return {};
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

      const healthScore = this.calculateHealthScore(dto.metrics);

      await this.prisma.node.update({
        where: { id: node.id },
        data: {
          lastHeartbeat: new Date(),
          status: NodeStatus.ONLINE,
          healthScore,
        },
      });

      return {
        status: 'ok',
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
        status: NodeStatus.ONLINE,
        lastHeartbeat: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Seen in last 5 minutes
        },
      },
      orderBy: {
        healthScore: 'desc',
      },
    });
  }

  private calculateHealthScore(metrics?: any): number {
    if (!metrics) return 100;

    const cpuUsage = (metrics as { cpu_usage?: number }).cpu_usage ?? 0;
    const ramUsage = (metrics as { ram_usage?: number }).ram_usage ?? 0;

    // Simple scoring algorithm:
    // Started at 100. Subtract usage percentages with weights.
    // CPU weight: 60%, RAM weight: 40%
    const cpuPenalty = Math.min(cpuUsage * 100 * 0.6, 60);
    const ramPenalty = Math.min(ramUsage * 100 * 0.4, 40);

    const score = 100 - cpuPenalty - ramPenalty;
    return Math.max(0, Math.round(score));
  }
}
