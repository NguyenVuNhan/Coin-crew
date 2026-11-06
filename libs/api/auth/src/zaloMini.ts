async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/**
 * The device id every phone signed in to this Zalo account shares as a guest:
 * 'z_' + unpadded base64url(HMAC-SHA256(secret, 'zalo:' + zaloSub)), 45 chars.
 */
export async function zaloDeviceId(secret: string, zaloSub: string): Promise<string> {
  const bytes = await hmacSha256(secret, `zalo:${zaloSub}`);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return 'z_' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Zalo Graph's `appsecret_proof`: lowercase hex HMAC-SHA256(appSecret, accessToken). */
export async function appSecretProof(appSecret: string, accessToken: string): Promise<string> {
  const bytes = await hmacSha256(appSecret, accessToken);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
