import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Request } from 'express';

export enum AlertType {
  HIGH_LOAD = 'high_load',
  NODE_DEATH = 'node_death',
  NODE_REGISTERED = 'node_registered',
  SYSTEM_ERROR = 'system_error',
  API_ERROR = 'api_error',
}

export interface Alert {
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, any>;
}

/** Parse first file path and line number from an Error stack. */
export function parseErrorLocation(
  stack: string | undefined,
): { file: string; line: number } | null {
  if (!stack) return null;
  // Match "at ... (path:line:col)" or "at path:line:col"
  const re = /at (?:\S+ \()?([^:)]+):(\d+):?\d*\)?/;
  const m = stack.match(re);
  if (!m) return null;
  const file = m[1].trim();
  const line = parseInt(m[2], 10);
  return isNaN(line) ? null : { file, line };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendSlackAlert(alert: Alert): Promise<void> {
    const webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');

    if (!webhookUrl) {
      this.logger.warn('SLACK_WEBHOOK_URL not configured, skipping alert');
      return;
    }

    const emoji = this.getSeverityEmoji(alert.severity);
    const formattedMessage = `${emoji} *${alert.type.toUpperCase()}*\n${alert.message}`;

    try {
      await firstValueFrom(
        this.httpService.post(webhookUrl, {
          text: formattedMessage,
        }),
      );
      this.logger.log(`Alert sent to Slack: ${alert.type}`);
    } catch (error) {
      this.logger.error(
        `Failed to send Slack alert: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private getSeverityEmoji(severity: 'info' | 'warning' | 'critical'): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  }

  async notifyHighLoad(
    nodeId: string,
    cpuUsage: number,
    threshold: number,
  ): Promise<void> {
    // TODO:
    // Trigger alert when node CPU usage exceeds threshold (e.g., 90%)
    const alert: Alert = {
      type: AlertType.HIGH_LOAD,
      severity: 'warning',
      message: `Node ${nodeId} experiencing high load: ${cpuUsage}% (threshold: ${threshold}%)`,
      metadata: { nodeId, cpuUsage, threshold },
    };
    await this.sendSlackAlert(alert);
  }

  async notifyNodeDeath(nodeId: string, lastHeartbeat: Date): Promise<void> {
    // TODO:
    // Trigger alert when node becomes unresponsive
    const alert: Alert = {
      type: AlertType.NODE_DEATH,
      severity: 'critical',
      message: `Node ${nodeId} is unresponsive. Last heartbeat: ${lastHeartbeat.toISOString()}`,
      metadata: { nodeId, lastHeartbeat },
    };
    await this.sendSlackAlert(alert);
  }

  async notifyNodeRegistered(nodeId: string, region: string): Promise<void> {
    // TODO:
    // Trigger info alert when new node joins fleet
    const alert: Alert = {
      type: AlertType.NODE_REGISTERED,
      severity: 'info',
      message: `New node registered: ${nodeId} in region ${region}`,
      metadata: { nodeId, region },
    };
    await this.sendSlackAlert(alert);
  }

  /**
   * Report any API error to Slack with file and line from the stack.
   * Call from the global exception filter for every error.
   */
  async reportErrorToSlack(
    exception: unknown,
    request: Request,
    statusCode: number,
    requestId: string,
  ): Promise<void> {
    const webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!webhookUrl) return;

    const err =
      exception instanceof Error ? exception : new Error(String(exception));
    const location = parseErrorLocation(err.stack);
    const fileLine = location ? `${location.file}:${location.line}` : 'unknown';

    const severity = statusCode >= 500 ? 'critical' : 'warning';
    const emoji = severity === 'critical' ? '🔴' : '⚠️';
    const text = [
      `${emoji} *API Error* (${statusCode})`,
      `*Message:* ${err.message}`,
      `*Location:* \`${fileLine}\``,
      `*Path:* ${request.method} ${request.url}`,
      `*Request ID:* ${requestId}`,
    ].join('\n');

    try {
      await firstValueFrom(this.httpService.post(webhookUrl, { text }));
    } catch (e) {
      this.logger.warn(
        `Failed to send error to Slack: ${(e as Error).message}`,
      );
    }
  }
}
