import type { ApiErrorCode } from '@cc/core';
import { linkTokens } from '@cc/web-util/linkTokens';
import { sessionStore } from '../platform/session';

export class ApiClientError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status: number,
    message: string,
    /** Extra fields of the error body (e.g. proposalId on PROPOSAL_PENDING). */
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { tripId?: string } = {},
): Promise<T> {
  const { tripId, headers: initHeaders, ...restInit } = init;
  const headers = new Headers(initHeaders);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (tripId) {
    const token = linkTokens.get(tripId);
    if (token) {
      headers.set('X-Link-Token', token);
    }
  }

  const token = sessionStore.token();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const deviceId = sessionStore.deviceId();
  if (deviceId) {
    headers.set('X-Device-Restore', deviceId);
  }

  const apiBase = sessionStore.apiBase();
  const url = apiBase + path;

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: apiBase === '' ? 'include' : 'omit',
      ...restInit,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network failure';
    throw new ApiClientError('INTERNAL', 0, message);
  }

  const deviceIdHeader = response.headers.get('X-Device-Id');
  if (deviceIdHeader) {
    void sessionStore.setDeviceId(deviceIdHeader);
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      void sessionStore.setToken(null);
    }
    let code: ApiErrorCode = 'INTERNAL';
    let message = response.statusText || 'Error';
    let details: Record<string, unknown> = {};
    try {
      const data = await response.json();
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        if (typeof data.error.code === 'string') {
          code = data.error.code as ApiErrorCode;
        }
        if (typeof data.error.message === 'string') {
          message = data.error.message;
        }
        details = data.error as Record<string, unknown>;
      }
    } catch {
      // parse failed, use fallback
    }
    throw new ApiClientError(code, response.status, message, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text || text.trim() === '') {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export function apiSend<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  tripId?: string,
  /** `keepalive` lets the request finish after the page is closed or left (a tick sent on the way out). */
  opts?: { keepalive?: boolean },
): Promise<T> {
  const headers = new Headers();
  let bodyStr: string | undefined;
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    bodyStr = JSON.stringify(body);
  }
  return apiFetch<T>(path, {
    method,
    headers,
    body: bodyStr,
    tripId,
    ...(opts?.keepalive ? { keepalive: true } : {}),
  });
}
