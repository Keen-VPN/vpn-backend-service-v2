import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: {
    uptime: number;
    version: string;
  };
  database: {
    status: 'connected' | 'disconnected';
    responseTime?: number;
  };
  errors?: string[];
}

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthCheckResponse> {
    const errors: string[] = [];

    // Database health check
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    let dbResponseTime: number | undefined;
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbResponseTime = Date.now() - dbStart;
      dbStatus = 'connected';
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(`Database: ${errorMessage}`);
    }

    // Determine overall health status
    const status: 'healthy' | 'degraded' | 'unhealthy' =
      dbStatus === 'connected' ? 'healthy' : 'unhealthy';

    return {
      status,
      timestamp: new Date().toISOString(),
      service: {
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
      },
      database: {
        status: dbStatus,
        responseTime: dbResponseTime,
      },
      ...(errors.length > 0 && { errors }),
    };
  }
}
