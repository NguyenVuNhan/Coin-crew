import type { Env } from '@cc/api-db/env';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailService {
  send(payload: EmailPayload): Promise<{ success: boolean; error?: string }>;
}

export class ConsoleEmailService implements EmailService {
  async send(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
    console.log('[ConsoleEmailService] Sending email:', {
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
    return { success: true };
  }
}

export class ResendEmailService implements EmailService {
  constructor(
    private readonly apiKey: string,
    private readonly from: string = 'Coin Crew <notifications@coincrew.io>'
  ) {}

  async send(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          success: false,
          error: `HTTP ${response.status} ${response.statusText}: ${errorText}`,
        };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
      };
    }
  }
}

export function createEmailService(env: Partial<Env> = {}): EmailService {
  if (env.RESEND_API_KEY) {
    const from = env.EMAIL_FROM || 'Coin Crew <notifications@coincrew.io>';
    return new ResendEmailService(env.RESEND_API_KEY, from);
  }
  return new ConsoleEmailService();
}
