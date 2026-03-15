import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { SafeLogger } from '../common/utils/logger.util';
import { RegisterNodeDto } from './dto/register-node.dto';
import { NodeHeartbeatDto } from './dto/node-heartbeat.dto';
import { NodeStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';

interface GeoLocationResponse {
  status: 'success' | 'fail';
  message?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

@Injectable()
export class NodesService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async register(dto: RegisterNodeDto) {
    try {
      let geoData = {};
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

  private async fetchGeoLocation(ip: string) {
    try {
      // Using ip-api.com (free for non-commercial use, limited rate)
      const response = await firstValueFrom(
        this.httpService.get<GeoLocationResponse>(
          `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,city,lat,lon`,
        ),
      );

      if (response.data && response.data.status === 'success') {
        const { country, city, countryCode, lat, lon } = response.data;
        return {
          country,
          city,
          latitude: lat,
          longitude: lon,
          flagUrl: countryCode
            ? `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
            : undefined,
        };
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
