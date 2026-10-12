import type { ApiErrorCode } from '@fsl/core';
import { linkTokens } from '../lib/linkTokens';

export class ApiClientError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status: number,
    message: string,
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

  try {
    const deviceId = localStorage.getItem('deviceId');
    if (deviceId) {
      headers.set('X-Device-Restore', deviceId);
    }
  } catch {
    // storage access error
  }

  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...restInit,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network failure';
    throw new ApiClientError('INTERNAL', 0, message);
  }

  const deviceIdHeader = response.headers.get('X-Device-Id');
  if (deviceIdHeader) {
    try {
      localStorage.setItem('deviceId', deviceIdHeader);
    } catch {
      // ignore
    }
  }

  if (!response.ok) {
    let code: ApiErrorCode = 'INTERNAL';
    let message = response.statusText || 'Error';
    try {
      const data = await response.json();
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        if (typeof data.error.code === 'string') {
          code = data.error.code as ApiErrorCode;
        }
        if (typeof data.error.message === 'string') {
          message = data.error.message;
        }
      }
    } catch {
      // parse failed, use fallback
    }
    throw new ApiClientError(code, response.status, message);
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
  });
}
