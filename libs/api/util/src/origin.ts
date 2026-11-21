const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

/**
 * The origin the browser used to reach the API, e.g. `http://localhost:8787` or the tunnel's
 * `https://…`. A reverse proxy (the DSM, ngrok) that terminates TLS says so in
 * `X-Forwarded-Proto` / `X-Forwarded-Host`; otherwise the request URL is the truth.
 *
 * Safe for OAuth `redirect_uri`: Google and Zalo only accept the callback URLs registered for the
 * app, so a forged header can only break the sender's own sign-in.
 */
export function requestOrigin(url: string, header: (name: string) => string | undefined): string {
  const own = new URL(url);
  const first = (name: string) => header(name)?.split(',')[0]?.trim().toLowerCase() || undefined;
  const proto = first('x-forwarded-proto');
  const host = first('x-forwarded-host');
  const scheme = proto === 'http' || proto === 'https' ? proto : own.protocol.slice(0, -1);
  const authority = host && HOST.test(host) ? host : own.host;
  return `${scheme}://${authority}`;
}
