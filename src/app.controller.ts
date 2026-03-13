import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService, HealthCheckResponse } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get('test-error')
  @ApiOperation({
    summary: 'Trigger test error (Slack)',
    description:
      'Throws an error to verify Slack error reporting. Remove or guard in production.',
  })
  @ApiResponse({ status: 500, description: 'Always returns 500' })
  triggerTestError(): never {
    throw new Error('Manual test error – Slack notification check');
  }

  @Get('/')
  @ApiOperation({
    summary: 'Health check endpoint',
    description:
      'Returns comprehensive health status including database connectivity',
  })
  @ApiResponse({
    status: 200,
    description: 'Health status with infrastructure checks',
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['healthy', 'degraded', 'unhealthy'],
          example: 'healthy',
        },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        service: {
          type: 'object',
          properties: {
            uptime: { type: 'number', example: 3600 },
            version: { type: 'string', example: '1.0.0' },
          },
        },
        database: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['connected', 'disconnected'] },
            responseTime: { type: 'number', example: 5 },
          },
        },
        errors: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async getHealth(): Promise<HealthCheckResponse> {
    return this.appService.getHealth();
  }
}
