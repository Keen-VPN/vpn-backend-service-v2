import { Injectable } from '@nestjs/common';

export enum AlertType {
  HIGH_LOAD = 'high_load',
  NODE_DEATH = 'node_death',
  NODE_REGISTERED = 'node_registered',
  SYSTEM_ERROR = 'system_error',
}

export interface Alert {
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendSlackAlert(_alert: Alert): Promise<void> {
    // TODO: Phase 2
    // 1. Format alert message for Slack
    // 2. Include relevant metadata (node ID, metrics, timestamp)
    // 3. Send POST request to Slack Webhook URL (#ops-infrastructure)
    // 4. Handle failures gracefully (log but don't block main flow)
    // 5. Consider rate limiting to avoid alert spam

    throw new Error('Not implemented');
  }

  async notifyHighLoad(
    nodeId: string,
    cpuUsage: number,
    threshold: number,
  ): Promise<void> {
    // TODO: Phase 2
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
    // TODO: Phase 2
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
    // TODO: Phase 2
    // Trigger info alert when new node joins fleet
    const alert: Alert = {
      type: AlertType.NODE_REGISTERED,
      severity: 'info',
      message: `New node registered: ${nodeId} in region ${region}`,
      metadata: { nodeId, region },
    };
    await this.sendSlackAlert(alert);
  }
}
