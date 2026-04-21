import { Injectable, Logger, Inject } from '@nestjs/common';
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

export interface ServerLocationRequest {
  region: string;
  reason: string;
  createdAt: string;
}

export type TrialBillingChannelSlack = 'stripe' | 'apple';

export interface TrialStartedSlackPayload {
  userId: string;
  userEmail: string;
  billingChannel: TrialBillingChannelSlack;
  planLabel: string;
  occurredAt: Date;
}

export type PaidConversionTypeSlack = 'new_paid' | 'trial_to_paid';

export interface PaidConversionSlackPayload {
  userId: string;
  userEmail: string;
  paymentSource: 'stripe' | 'apple';
  planDisplay: string;
  conversionType: PaidConversionTypeSlack;
  occurredAt: Date;
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
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  private isDevelopment(): boolean {
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV;
    return nodeEnv === 'development';
  }

  /** Trial growth notifications are intentionally production-only (not staging/test). */
  private isProductionRuntime(): boolean {
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV;
    return nodeEnv === 'production';
  }

  private getRuntimeEnvironment(): string {
    return (
      this.configService.get<string>('APP_ENV') ||
      this.configService.get<string>('ENVIRONMENT') ||
      this.configService.get<string>('NODE_ENV') ||
      process.env.APP_ENV ||
      process.env.ENVIRONMENT ||
      process.env.NODE_ENV ||
      'unknown'
    );
  }

  private sanitizeForSlackUrl(url: string): string {
    // Strip Slack mrkdwn control characters that could be used to spoof links.
    // Normal URLs never require these, so removing them is safe.
    return url.replace(/[<>*_|~]/g, '');
  }

  private sanitizeForSlackText(text: string): string {
    // Strip Slack mrkdwn control characters from arbitrary user-supplied text
    // to prevent injection of formatted links, bold, italic, strikethrough, or
    // code spans into Slack messages.
    return text.replace(/[*_~`<>|]/g, '');
  }

  /** e.g. "Monthly trial" → "Monthly (Trial)" */
  private formatTrialPlanLine(sanitizedPlanLabel: string): string {
    const base = sanitizedPlanLabel.replace(/\s+trial\s*$/i, '').trim();
    if (base.length > 0) {
      return `${base} (Trial)`;
    }
    return `${sanitizedPlanLabel} (Trial)`;
  }

  /** e.g. 2026-04-16 15:42 (UTC) */
  private formatTrialTimestampUtc(occurredAt: Date): string {
    const y = occurredAt.getUTCFullYear();
    const mo = String(occurredAt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(occurredAt.getUTCDate()).padStart(2, '0');
    const h = String(occurredAt.getUTCHours()).padStart(2, '0');
    const min = String(occurredAt.getUTCMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day} ${h}:${min}`;
  }

  private getFullEndpointUrl(request?: Request): string | null {
    if (!request) return null;
    const hostHeader = request.get('host') || '';
    const forwardedProto =
      (request.headers['x-forwarded-proto'] as string) || '';
    const forwardedHostHeader =
      (request.headers['x-forwarded-host'] as string) || '';
    const proto =
      forwardedProto.split(',')[0]?.trim() ||
      (request.secure ? 'https' : 'http');
    const path = request.originalUrl || request.url || '';

    // Prefer the actual Host header first.
    if (hostHeader) {
      return this.sanitizeForSlackUrl(`${proto}://${hostHeader}${path}`);
    }

    // Optionally trust X-Forwarded-Host, but only when explicitly allowed.
    const trustForwardedHost =
      this.configService.get<boolean>('TRUST_FORWARDED_HOST') === true ||
      process.env.TRUST_FORWARDED_HOST === 'true';
    if (trustForwardedHost && forwardedHostHeader) {
      const forwardedHost = forwardedHostHeader.split(',')[0]?.trim();
      // Basic allowlist support via ALLOWED_HOSTS (comma-separated).
      const allowed =
        this.configService.get<string>('ALLOWED_HOSTS') ||
        process.env.ALLOWED_HOSTS ||
        '';
      const allowedHosts = allowed
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      if (
        forwardedHost &&
        (allowedHosts.length === 0 ||
          allowedHosts.some(
            (h) => forwardedHost === h || forwardedHost.endsWith(`.${h}`),
          ))
      ) {
        return this.sanitizeForSlackUrl(`${proto}://${forwardedHost}${path}`);
      }
    }

    // Fallback for environments where Host headers aren't reliable (serverless/proxy setups).
    const baseUrl =
      this.configService.get<string>('PUBLIC_BASE_URL') ||
      this.configService.get<string>('API_BASE_URL') ||
      process.env.PUBLIC_BASE_URL ||
      process.env.API_BASE_URL ||
      '';
    if (!baseUrl) return null;
    return this.sanitizeForSlackUrl(`${baseUrl.replace(/\/+$/, '')}${path}`);
  }

  async sendSlackAlert(alert: Alert): Promise<void> {
    if (this.isDevelopment()) return;

    const webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');

    if (!webhookUrl) {
      this.logger.warn('SLACK_WEBHOOK_URL not configured, skipping alert');
      return;
    }

    const emoji = this.getSeverityEmoji(alert.severity);
    const env = this.getRuntimeEnvironment();
    const endpointUrl =
      typeof alert.metadata?.endpointUrl === 'string'
        ? alert.metadata.endpointUrl
        : null;
    const formattedMessage = [
      `${emoji} *${alert.type.toUpperCase()}*`,
      `*Environment:* ${env}`,
      endpointUrl ? `*Endpoint:* ${endpointUrl}` : null,
      alert.message,
    ]
      .filter(Boolean)
      .join('\n');

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
    if (this.isDevelopment()) return;

    const webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!webhookUrl) return;

    const err =
      exception instanceof Error ? exception : new Error(String(exception));
    const location = parseErrorLocation(err.stack);
    const fileLine = location ? `${location.file}:${location.line}` : 'unknown';
    const env = this.getRuntimeEnvironment();
    const endpointUrl = this.getFullEndpointUrl(request);

    const severity = statusCode >= 500 ? 'critical' : 'warning';
    const emoji = severity === 'critical' ? '🔴' : '⚠️';
    const text = [
      `${emoji} *API Error* (${statusCode})`,
      `*Environment:* ${env}`,
      endpointUrl ? `*Endpoint:* ${endpointUrl}` : null,
      `*Message:* ${err.message}`,
      `*Location:* \`${fileLine}\``,
      `*Path:* ${request.method} ${request.url}`,
      `*Request ID:* ${requestId}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await firstValueFrom(this.httpService.post(webhookUrl, { text }));
    } catch (e) {
      this.logger.warn(
        `Failed to send error to Slack: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Growth / onboarding: notify when a user’s VPN free trial is activated after billing is in place.
   * Production only (NODE_ENV=production). Uses SLACK_TRIAL_WEBHOOK_URL so trial traffic can be
   * routed separately from ops alerts.
   */
  /** @returns true if a message was posted to Slack */
  async notifyTrialStarted(
    payload: TrialStartedSlackPayload,
  ): Promise<boolean> {
    if (this.isDevelopment()) return false;

    if (!this.isProductionRuntime()) {
      return false;
    }

    const webhookUrl = this.configService.get<string>(
      'SLACK_TRIAL_WEBHOOK_URL',
    );

    if (!webhookUrl) {
      this.logger.warn(
        'SLACK_TRIAL_WEBHOOK_URL not configured; trial-started Slack notification skipped',
      );
      return false;
    }

    const email = this.sanitizeForSlackText(payload.userEmail);
    const planLine = this.formatTrialPlanLine(
      this.sanitizeForSlackText(payload.planLabel),
    );
    const signupMethod =
      payload.billingChannel === 'stripe' ? 'Stripe' : 'Apple';
    const when = this.formatTrialTimestampUtc(payload.occurredAt);

    const text = [
      `🎉 *New Free Trial Started*`,
      '',
      `*User:* ${email}`,
      `*Signup Method:* ${signupMethod}`,
      `*Plan:* ${planLine}`,
      `*Time:* ${when}`,
    ].join('\n');

    try {
      await firstValueFrom(this.httpService.post(webhookUrl, { text }));
      this.logger.log(
        `Trial-started Slack notification sent for ${payload.userId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send trial-started Slack: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return false;
    }
  }

  /**
   * Revenue / growth: first-time paid subscription (same Slack channel as trials).
   * Production only; uses SLACK_TRIAL_WEBHOOK_URL.
   */
  async notifyPaidConversion(
    payload: PaidConversionSlackPayload,
  ): Promise<boolean> {
    if (this.isDevelopment()) {
      return false;
    }

    if (!this.isProductionRuntime()) {
      return false;
    }

    const webhookUrl = this.configService.get<string>(
      'SLACK_TRIAL_WEBHOOK_URL',
    );

    if (!webhookUrl) {
      this.logger.warn(
        'SLACK_TRIAL_WEBHOOK_URL not configured; paid-conversion Slack skipped',
      );
      return false;
    }

    const email = this.sanitizeForSlackText(payload.userEmail);
    const plan = this.sanitizeForSlackText(payload.planDisplay);
    const source = payload.paymentSource === 'stripe' ? 'Stripe' : 'Apple';
    const typeLine =
      payload.conversionType === 'trial_to_paid'
        ? 'Trial → Paid'
        : 'New paid user';
    const when = this.formatTrialTimestampUtc(payload.occurredAt);

    const text = [
      `💰 *New Paid User*`,
      '',
      `*User:* ${email}`,
      `*Source:* ${source}`,
      `*Plan:* ${plan}`,
      `*Type:* ${typeLine}`,
      `*Time:* ${when}`,
    ].join('\n');

    try {
      await firstValueFrom(this.httpService.post(webhookUrl, { text }));
      this.logger.log(
        `Paid-conversion Slack notification sent for ${payload.userId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send paid-conversion Slack: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return false;
    }
  }

  async notifyServerLocationRequest(
    request: ServerLocationRequest,
  ): Promise<void> {
    if (this.isDevelopment()) return;

    const webhookUrl = this.configService.get<string>(
      'SLACK_SERVER_REQUESTS_WEBHOOK_URL',
    );

    if (!webhookUrl) {
      const nodeEnv =
        this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV;
      this.logger.error(
        `SLACK_SERVER_REQUESTS_WEBHOOK_URL not configured (NODE_ENV=${nodeEnv}); server location request notification dropped`,
      );
      return;
    }

    const region = this.sanitizeForSlackText(request.region);
    const reason = this.sanitizeForSlackText(request.reason);
    const submitted = new Date(request.createdAt).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    });
    const text = [
      `🌍 *New Server Location Request*`,
      `*Country:* ${region}`,
      `*Reason:* ${reason}`,
      `*Submitted:* ${submitted} UTC`,
    ].join('\n');

    try {
      await firstValueFrom(this.httpService.post(webhookUrl, { text }));
      this.logger.log(
        `Server location request notification sent for region: ${request.region}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send server location request to Slack: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
