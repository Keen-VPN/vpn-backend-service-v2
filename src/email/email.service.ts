import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface ResendEmailRequest {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string | string[];
}

interface UserEmailPayload {
  email: string;
  displayName?: string | null;
}

interface SubscriptionEmailPayload extends UserEmailPayload {
  planName?: string | null;
  billingPeriod?: string | null;
  currentPeriodEnd?: Date | null;
}

interface SalesContactEmailPayload {
  workEmail: string;
  companyName: string;
  teamSize: number;
  countryRegion?: string | null;
  referenceId: string;
  preferredContactMethod?: string | null;
  preferredContactTime?: string | null;
  phone?: string | null;
  useCase?: string | null;
  message?: string | null;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resendEndpoint = 'https://api.resend.com/emails';

  constructor(
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async sendWelcomeEmail(user: UserEmailPayload): Promise<boolean> {
    const name = this.displayName(user);
    return this.sendEmail({
      to: user.email,
      subject: 'Welcome to KeenVPN',
      html: this.layout(
        'Welcome to KeenVPN',
        [
          `<p>Hi ${this.escapeHtml(name)},</p>`,
          '<p>Your KeenVPN account is ready. You can now use secure VPN access across your devices.</p>',
          '<p>If you did not create this account, please contact support so we can help secure it.</p>',
        ].join(''),
      ),
      text: [
        `Hi ${name},`,
        '',
        'Your KeenVPN account is ready. You can now use secure VPN access across your devices.',
        '',
        'If you did not create this account, please contact support so we can help secure it.',
      ].join('\n'),
    });
  }

  async sendAccountDeletedEmail(user: UserEmailPayload): Promise<boolean> {
    const name = this.displayName(user);
    return this.sendEmail({
      to: user.email,
      subject: 'Your KeenVPN account has been deleted',
      html: this.layout(
        'Account deleted',
        [
          `<p>Hi ${this.escapeHtml(name)},</p>`,
          '<p>Your KeenVPN account deletion request has been completed.</p>',
          '<p>If you did not request this, please contact support immediately.</p>',
        ].join(''),
      ),
      text: [
        `Hi ${name},`,
        '',
        'Your KeenVPN account deletion request has been completed.',
        '',
        'If you did not request this, please contact support immediately.',
      ].join('\n'),
    });
  }

  async sendSubscriptionStartedEmail(
    payload: SubscriptionEmailPayload,
  ): Promise<boolean> {
    const name = this.displayName(payload);
    const plan = this.describePlan(payload);
    const periodEnd = this.formatDate(payload.currentPeriodEnd);
    return this.sendEmail({
      to: payload.email,
      subject: 'Your KeenVPN subscription is active',
      html: this.layout(
        'Subscription active',
        [
          `<p>Hi ${this.escapeHtml(name)},</p>`,
          `<p>Your ${this.escapeHtml(plan)} subscription is now active.</p>`,
          periodEnd
            ? `<p>Your current billing period ends on ${this.escapeHtml(periodEnd)}.</p>`
            : '',
          '<p>Thanks for choosing KeenVPN.</p>',
        ].join(''),
      ),
      text: [
        `Hi ${name},`,
        '',
        `Your ${plan} subscription is now active.`,
        periodEnd ? `Your current billing period ends on ${periodEnd}.` : '',
        '',
        'Thanks for choosing KeenVPN.',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  async sendSubscriptionRenewedEmail(
    payload: SubscriptionEmailPayload,
  ): Promise<boolean> {
    const name = this.displayName(payload);
    const plan = this.describePlan(payload);
    const periodEnd = this.formatDate(payload.currentPeriodEnd);
    return this.sendEmail({
      to: payload.email,
      subject: 'Your KeenVPN subscription renewed',
      html: this.layout(
        'Subscription renewed',
        [
          `<p>Hi ${this.escapeHtml(name)},</p>`,
          `<p>Your ${this.escapeHtml(plan)} subscription payment was received.</p>`,
          periodEnd
            ? `<p>Your access is renewed through ${this.escapeHtml(periodEnd)}.</p>`
            : '',
        ].join(''),
      ),
      text: [
        `Hi ${name},`,
        '',
        `Your ${plan} subscription payment was received.`,
        periodEnd ? `Your access is renewed through ${periodEnd}.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  async sendSubscriptionCancelledEmail(
    payload: SubscriptionEmailPayload,
  ): Promise<boolean> {
    const name = this.displayName(payload);
    const plan = this.describePlan(payload);
    return this.sendEmail({
      to: payload.email,
      subject: 'Your KeenVPN subscription was cancelled',
      html: this.layout(
        'Subscription cancelled',
        [
          `<p>Hi ${this.escapeHtml(name)},</p>`,
          `<p>Your ${this.escapeHtml(plan)} subscription has been cancelled.</p>`,
          '<p>You can resubscribe any time from your account.</p>',
        ].join(''),
      ),
      text: [
        `Hi ${name},`,
        '',
        `Your ${plan} subscription has been cancelled.`,
        'You can resubscribe any time from your account.',
      ].join('\n'),
    });
  }

  async sendSalesContactConfirmation(
    payload: SalesContactEmailPayload,
  ): Promise<boolean> {
    return this.sendEmail({
      to: payload.workEmail,
      subject: `KeenVPN sales inquiry received (${payload.referenceId})`,
      html: this.layout(
        'Sales inquiry received',
        [
          `<p>Thanks for contacting KeenVPN about ${this.escapeHtml(payload.companyName)}.</p>`,
          `<p>Your reference ID is <strong>${this.escapeHtml(payload.referenceId)}</strong>. Our team will review your request and follow up soon.</p>`,
        ].join(''),
      ),
      text: [
        `Thanks for contacting KeenVPN about ${payload.companyName}.`,
        '',
        `Your reference ID is ${payload.referenceId}. Our team will review your request and follow up soon.`,
      ].join('\n'),
    });
  }

  async notifySalesTeam(payload: SalesContactEmailPayload): Promise<boolean> {
    const salesEmail = this.configService.get<string>('SALES_EMAIL');
    if (!salesEmail) {
      this.logger.warn('SALES_EMAIL not configured; sales email skipped');
      return false;
    }

    const rawDetails: Array<[string, string | null | undefined]> = [
      ['Reference ID', payload.referenceId],
      ['Company', payload.companyName],
      ['Work email', payload.workEmail],
      ['Team size', String(payload.teamSize)],
      ['Country/region', payload.countryRegion],
      ['Preferred contact', payload.preferredContactMethod],
      ['Preferred time', payload.preferredContactTime],
      ['Phone', payload.phone],
      ['Use case', payload.useCase],
      ['Message', payload.message],
    ];
    const details = rawDetails.filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    );

    return this.sendEmail({
      to: salesEmail,
      reply_to: payload.workEmail,
      subject: `New KeenVPN sales inquiry: ${payload.companyName}`,
      html: this.layout(
        'New sales inquiry',
        `<dl>${details
          .map(
            ([label, value]) =>
              `<dt><strong>${this.escapeHtml(label)}</strong></dt><dd>${this.escapeHtml(value)}</dd>`,
          )
          .join('')}</dl>`,
      ),
      text: details.map(([label, value]) => `${label}: ${value}`).join('\n'),
    });
  }

  private async sendEmail(
    payload: Omit<ResendEmailRequest, 'from'>,
  ): Promise<boolean> {
    const apiKey =
      this.configService.get<string>('RESEND_API_KEY') ||
      process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not configured; email skipped');
      return false;
    }

    const from =
      this.configService.get<string>('EMAIL_FROM') ||
      process.env.EMAIL_FROM ||
      'KeenVPN <no-reply@vpnkeen.com>';

    try {
      await firstValueFrom(
        this.httpService.post(
          this.resendEndpoint,
          { ...payload, from },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      this.logger.log(`Email sent: ${payload.subject}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return false;
    }
  }

  private displayName(user: UserEmailPayload): string {
    return user.displayName?.trim() || 'there';
  }

  private describePlan(payload: SubscriptionEmailPayload): string {
    if (payload.planName) return payload.planName;
    if (payload.billingPeriod === 'year') return 'annual KeenVPN';
    if (payload.billingPeriod === 'month') return 'monthly KeenVPN';
    return 'KeenVPN';
  }

  private formatDate(date?: Date | null): string | null {
    if (!date) return null;
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(date);
  }

  private layout(title: string, body: string): string {
    return [
      '<!doctype html>',
      '<html>',
      '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">',
      `<h1 style="font-size:20px;">${this.escapeHtml(title)}</h1>`,
      body,
      `<p style="color:#6b7280;font-size:12px;">KeenVPN Support: ${this.escapeHtml(this.supportEmail())}</p>`,
      '</body>',
      '</html>',
    ].join('');
  }

  private supportEmail(): string {
    return (
      this.configService.get<string>('SUPPORT_EMAIL') ||
      process.env.SUPPORT_EMAIL ||
      'support@vpnkeen.com'
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
