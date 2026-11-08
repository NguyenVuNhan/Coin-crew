import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEmailService,
  ConsoleEmailService,
  ResendEmailService,
} from '../src/notifications/emailService';

describe('EmailService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('ConsoleEmailService (fallback when RESEND_API_KEY is not set)', () => {
    it('creates ConsoleEmailService when RESEND_API_KEY is missing', () => {
      const service = createEmailService({});
      expect(service).toBeInstanceOf(ConsoleEmailService);
    });

    it('logs email payload and returns success: true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const service = createEmailService({});

      const payload = {
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello World</p>',
        text: 'Hello World',
      };

      const result = await service.send(payload);

      expect(result).toEqual({ success: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ConsoleEmailService]'),
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Test Subject',
        })
      );
    });
  });

  describe('ResendEmailService', () => {
    it('creates ResendEmailService when RESEND_API_KEY is present', () => {
      const service = createEmailService({ RESEND_API_KEY: 're_test_key_123' });
      expect(service).toBeInstanceOf(ResendEmailService);
    });

    it('sends POST request to Resend API with correct headers and payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'resend_email_id_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      globalThis.fetch = mockFetch;

      const service = createEmailService({
        RESEND_API_KEY: 're_test_key_123',
        EMAIL_FROM: 'Coin Crew <support@coincrew.io>',
      });

      const payload = {
        to: 'member@example.com',
        subject: 'Expense Notification',
        html: '<p>Expense details</p>',
        text: 'Expense details',
      };

      const result = await service.send(payload);

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.resend.com/emails');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer re_test_key_123',
          'Content-Type': 'application/json',
        })
      );

      const body = JSON.parse(options.body);
      expect(body.from).toBe('Coin Crew <support@coincrew.io>');
      expect(body.to).toEqual(['member@example.com']);
      expect(body.subject).toBe('Expense Notification');
      expect(body.html).toBe('<p>Expense details</p>');
      expect(body.text).toBe('Expense details');
    });

    it('uses default EMAIL_FROM when none is configured in env', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'resend_id' }), { status: 200 })
      );
      globalThis.fetch = mockFetch;

      const service = createEmailService({ RESEND_API_KEY: 're_test_key' });
      await service.send({
        to: 'member@example.com',
        subject: 'Default From Test',
        html: '<p>Test</p>',
        text: 'Test',
      });

      const [, options] = mockFetch.mock.calls[0]!;
      const body = JSON.parse(options.body);
      expect(body.from).toBe('Coin Crew <notifications@coincrew.io>');
    });

    it('handles provider 500 error gracefully without throwing (Review Focus #3)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      const service = createEmailService({ RESEND_API_KEY: 're_test_key' });
      const result = await service.send({
        to: 'user@example.com',
        subject: 'Error Test',
        html: '<p>Hi</p>',
        text: 'Hi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('500');
    });

    it('handles provider 422 Unprocessable Entity error without throwing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Invalid recipient email' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const service = createEmailService({ RESEND_API_KEY: 're_test_key' });
      const result = await service.send({
        to: 'invalid-email',
        subject: 'Bad Email',
        html: '<p>Hi</p>',
        text: 'Hi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('422');
    });

    it('handles network failure / fetch exception gracefully without throwing (Review Focus #3)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused by provider'));

      const service = createEmailService({ RESEND_API_KEY: 're_test_key' });
      const result = await service.send({
        to: 'user@example.com',
        subject: 'Network Exception Test',
        html: '<p>Hi</p>',
        text: 'Hi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused by provider');
    });
  });
});
