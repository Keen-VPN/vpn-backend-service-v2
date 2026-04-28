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

interface EmailLayoutOptions {
  preheader: string;
  eyebrow?: string;
  cta?: {
    label: string;
    url: string;
  };
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
    const accountUrl = this.accountUrl();
    return this.sendEmail({
      to: user.email,
      subject: 'Welcome to KeenVPN - your secure account is ready',
      html: this.layout(
        'Your private VPN access is ready',
        [
          this.paragraph(`Hi ${name},`),
          this.paragraph(
            'Welcome to KeenVPN. Your account is set up and ready for secure, private VPN access across your devices.',
          ),
          this.paragraph(
            'You can manage your subscription, billing, and account details from your KeenVPN account whenever you need to.',
          ),
          this.notice(
            'If you did not create this account, contact support immediately so we can help protect it.',
          ),
        ].join(''),
        {
          preheader:
            'Your KeenVPN account is ready for secure private browsing.',
          eyebrow: 'Account created',
          cta: { label: 'Open your account', url: accountUrl },
        },
      ),
      text: [
        `Hi ${name},`,
        '',
        'Welcome to KeenVPN. Your account is set up and ready for secure, private VPN access across your devices.',
        '',
        `Manage your account: ${accountUrl}`,
        '',
        'If you did not create this account, contact support immediately so we can help protect it.',
      ].join('\n'),
    });
  }

  async sendAccountDeletedEmail(user: UserEmailPayload): Promise<boolean> {
    const name = this.displayName(user);
    return this.sendEmail({
      to: user.email,
      subject: 'Your KeenVPN account has been deleted',
      html: this.layout(
        'Your account has been deleted',
        [
          this.paragraph(`Hi ${name},`),
          this.paragraph(
            'Your KeenVPN account deletion request has been completed. Your account access has been closed.',
          ),
          this.notice(
            'If you did not request this deletion, contact support immediately and we will help investigate.',
          ),
        ].join(''),
        {
          preheader: 'Your KeenVPN account deletion request is complete.',
          eyebrow: 'Account update',
          cta: { label: 'Contact support', url: this.supportMailtoUrl() },
        },
      ),
      text: [
        `Hi ${name},`,
        '',
        'Your KeenVPN account deletion request has been completed. Your account access has been closed.',
        '',
        'If you did not request this deletion, contact support immediately and we will help investigate.',
      ].join('\n'),
    });
  }

  async sendSubscriptionStartedEmail(
    payload: SubscriptionEmailPayload,
  ): Promise<boolean> {
    const name = this.displayName(payload);
    const plan = this.describePlan(payload);
    const periodEnd = this.formatDate(payload.currentPeriodEnd);
    const accountUrl = this.accountUrl();
    return this.sendEmail({
      to: payload.email,
      subject: 'Your KeenVPN subscription is active',
      html: this.layout(
        'Your subscription is active',
        [
          this.paragraph(`Hi ${name},`),
          this.paragraph(
            `Your ${plan} subscription is active. You now have full access to KeenVPN premium features.`,
          ),
          periodEnd
            ? this.detailList([['Current period ends', periodEnd]])
            : '',
          this.paragraph(
            'Thanks for choosing KeenVPN. We are glad to help keep your connection private and secure.',
          ),
        ].join(''),
        {
          preheader: `Your ${plan} subscription is now active.`,
          eyebrow: 'Subscription confirmed',
          cta: { label: 'Manage subscription', url: accountUrl },
        },
      ),
      text: [
        `Hi ${name},`,
        '',
        `Your ${plan} subscription is active. You now have full access to KeenVPN premium features.`,
        periodEnd ? `Your current billing period ends on ${periodEnd}.` : '',
        '',
        `Manage your subscription: ${accountUrl}`,
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
    const accountUrl = this.accountUrl();
    return this.sendEmail({
      to: payload.email,
      subject: 'Your KeenVPN subscription renewed',
      html: this.layout(
        'Your subscription has renewed',
        [
          this.paragraph(`Hi ${name},`),
          this.paragraph(
            `Your ${plan} subscription payment was received successfully.`,
          ),
          periodEnd
            ? this.detailList([['Access renewed through', periodEnd]])
            : '',
          this.paragraph(
            'No action is needed. Your KeenVPN protection continues uninterrupted.',
          ),
        ].join(''),
        {
          preheader: `Your ${plan} subscription payment was received.`,
          eyebrow: 'Payment received',
          cta: { label: 'View account', url: accountUrl },
        },
      ),
      text: [
        `Hi ${name},`,
        '',
        `Your ${plan} subscription payment was received successfully.`,
        periodEnd ? `Your access is renewed through ${periodEnd}.` : '',
        '',
        `View your account: ${accountUrl}`,
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
    const accountUrl = this.accountUrl();
    return this.sendEmail({
      to: payload.email,
      subject: 'Your KeenVPN subscription was cancelled',
      html: this.layout(
        'Your subscription was cancelled',
        [
          this.paragraph(`Hi ${name},`),
          this.paragraph(
            `Your ${plan} subscription has been cancelled. If your plan still has remaining time, your access may continue until the end of the current billing period.`,
          ),
          this.paragraph(
            'You can restart your subscription any time from your account.',
          ),
        ].join(''),
        {
          preheader: `Your ${plan} subscription has been cancelled.`,
          eyebrow: 'Subscription update',
          cta: { label: 'Open account', url: accountUrl },
        },
      ),
      text: [
        `Hi ${name},`,
        '',
        `Your ${plan} subscription has been cancelled. If your plan still has remaining time, your access may continue until the end of the current billing period.`,
        '',
        `Open your account: ${accountUrl}`,
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
        'We received your inquiry',
        [
          this.paragraph(
            `Thanks for contacting KeenVPN about ${payload.companyName}.`,
          ),
          this.paragraph(
            'Our team will review your request and follow up with the best next step for your organization.',
          ),
          this.detailList([
            ['Reference ID', payload.referenceId],
            ['Team size', String(payload.teamSize)],
          ]),
        ].join(''),
        {
          preheader: `Your KeenVPN sales inquiry ${payload.referenceId} was received.`,
          eyebrow: 'Sales inquiry',
          cta: { label: 'Contact support', url: this.supportMailtoUrl() },
        },
      ),
      text: [
        `Thanks for contacting KeenVPN about ${payload.companyName}.`,
        '',
        'Our team will review your request and follow up with the best next step for your organization.',
        '',
        `Reference ID: ${payload.referenceId}`,
        `Team size: ${payload.teamSize}`,
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
        [
          this.paragraph(
            'A new enterprise sales inquiry was submitted from the website.',
          ),
          this.detailList(details),
        ].join(''),
        {
          preheader: `${payload.companyName} submitted a KeenVPN sales inquiry.`,
          eyebrow: 'Internal notification',
          cta: { label: 'Reply to lead', url: `mailto:${payload.workEmail}` },
        },
      ),
      text: details.map(([label, value]) => `${label}: ${value}`).join('\n'),
    });
  }

  private async sendEmail(
    payload: Omit<ResendEmailRequest, 'from'>,
  ): Promise<boolean> {
    if (this.hasSyntheticAppleFallbackRecipient(payload.to)) {
      this.logger.warn(
        `Email skipped for synthetic Apple fallback recipient: ${payload.subject}`,
      );
      return true;
    }

    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not configured; email skipped');
      return false;
    }

    const from =
      this.configService.get<string>('EMAIL_FROM') ||
      'KeenVPN <no-reply@vpnkeen.com>';
    const timeout =
      this.configService.get<number>('RESEND_TIMEOUT_MS') ?? 10000;

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
            timeout,
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

  private hasSyntheticAppleFallbackRecipient(to: string | string[]): boolean {
    const recipients = Array.isArray(to) ? to : [to];
    return recipients.some((recipient) =>
      /^apple_.+@temp\.com$/i.test(recipient),
    );
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

  private layout(
    title: string,
    body: string,
    options: EmailLayoutOptions,
  ): string {
    const preheader = this.escapeHtml(options.preheader);
    const eyebrow = options.eyebrow
      ? `<div style="margin:0 0 14px;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${this.escapeHtml(options.eyebrow)}</div>`
      : '';
    const cta = options.cta
      ? `<div style="margin:30px 0 6px;"><a href="${this.escapeHtml(options.cta.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 22px;font-size:14px;font-weight:700;">${this.escapeHtml(options.cta.label)}</a></div>`
      : '';

    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
      '<body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">',
      `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>`,
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:32px 16px;">',
      '<tr><td align="center">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.08);">',
      '<tr><td style="padding:28px 32px;background:#07111f;color:#ffffff;">',
      '<div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;">KeenVPN</div>',
      '<div style="margin-top:6px;color:#bfdbfe;font-size:13px;">Private, secure VPN access for every connection.</div>',
      '</td></tr>',
      '<tr><td style="padding:36px 32px;">',
      eyebrow,
      `<h1 style="margin:0 0 18px;color:#0f172a;font-size:28px;line-height:1.2;letter-spacing:-0.03em;">${this.escapeHtml(title)}</h1>`,
      body,
      cta,
      '</td></tr>',
      '<tr><td style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">',
      `<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">Need help? Contact <a href="${this.escapeHtml(this.supportMailtoUrl())}" style="color:#2563eb;text-decoration:none;">${this.escapeHtml(this.supportEmail())}</a>.</p>`,
      '<p style="margin:10px 0 0;color:#94a3b8;font-size:11px;line-height:1.5;">You received this email because you have a KeenVPN account or submitted a request to KeenVPN.</p>',
      '</td></tr>',
      '</table>',
      '</td></tr>',
      '</table>',
      '</body>',
      '</html>',
    ].join('');
  }

  private paragraph(text: string): string {
    return `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">${this.escapeHtml(text)}</p>`;
  }

  private notice(text: string): string {
    return `<div style="margin:24px 0 0;padding:16px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;color:#1e3a8a;font-size:14px;line-height:1.6;">${this.escapeHtml(text)}</div>`;
  }

  private detailList(rows: Array<[string, string]>): string {
    return [
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">',
      ...rows.map(
        ([label, value]) =>
          `<tr><td style="padding:12px 14px;background:#f8fafc;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;width:42%;">${this.escapeHtml(label)}</td><td style="padding:12px 14px;color:#0f172a;font-size:14px;">${this.escapeHtml(value)}</td></tr>`,
      ),
      '</table>',
    ].join('');
  }

  private supportEmail(): string {
    return (
      this.configService.get<string>('SUPPORT_EMAIL') || 'support@vpnkeen.com'
    );
  }

  private supportMailtoUrl(): string {
    return `mailto:${this.supportEmail()}`;
  }

  private accountUrl(): string {
    return (
      this.configService.get<string>('ACCOUNT_URL') ||
      'https://vpnkeen.com/account'
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
