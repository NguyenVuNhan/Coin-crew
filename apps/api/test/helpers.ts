import { env } from 'cloudflare:test';
import { createApp } from '../src/app';

export const app = createApp();

export function call(path: string, init: RequestInit = {}): Promise<Response> {
  return Promise.resolve(app.request(path, init, env));
}

/** name=value pairs from every Set-Cookie header, ignoring attributes. */
export function cookiesFrom(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair = ''] = line.split(';');
    const i = pair.indexOf('=');
    out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

export function unsignedJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.sig`;
}
