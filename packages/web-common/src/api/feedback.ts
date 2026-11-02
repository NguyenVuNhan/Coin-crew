import type { FeedbackRequest } from '@fsl/core';
import { apiFetch } from './client';

/** `POST /api/feedback`. Throws `ApiClientError` (e.g. `RATE_LIMITED`) like every other call. */
export async function sendFeedback(body: FeedbackRequest): Promise<void> {
  await apiFetch<{ ok: true }>('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
