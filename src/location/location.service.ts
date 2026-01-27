import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationResponseDto } from './dto/location-response.dto';

@Injectable()
export class LocationService {
  private readonly HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prismaService: PrismaService) {}

  async getAvailableLocations(): Promise<LocationResponseDto[]> {
    const nodes = await this.prismaService.node.findMany({
      where: {
        status: 'active',
      },
      select: {
        region: true,
        country: true,
        city: true,
        cpuUsage: true,
        lastHeartbeat: true,
        status: true,
      },
    });

    const now = Date.now();
    const healthyNodes = nodes.filter((node) => {
      if (node.status !== 'active') return false;
      const heartbeatAge = now - new Date(node.lastHeartbeat).getTime();
      return heartbeatAge <= this.HEARTBEAT_THRESHOLD_MS;
    });

    const regionMap = new Map<
      string,
      { country: string; city?: string; cpuUsages: number[] }
    >();

    for (const node of healthyNodes) {
      if (!regionMap.has(node.region)) {
        regionMap.set(node.region, {
          country: node.country,
          city: node.city || undefined,
          cpuUsages: [],
        });
      }
      regionMap.get(node.region)!.cpuUsages.push(node.cpuUsage);
    }

    const locations: LocationResponseDto[] = [];

    for (const [region, data] of regionMap.entries()) {
      const averageLoad =
        data.cpuUsages.reduce((sum, cpu) => sum + cpu, 0) /
        data.cpuUsages.length;

      locations.push({
        region,
        country: data.country,
        city: data.city,
        availableNodes: data.cpuUsages.length,
        averageLoad: Math.round(averageLoad * 10) / 10,
      });
    }

    return locations;
  }
}
