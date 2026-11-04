import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { People } from '../People';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = { route: '/t/t-1/people', path: '/t/:tripId/people' };
const addCalls = (calls: { method: string; path: string; body?: unknown }[]) =>
  calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/people');

describe('Adding a name that looks like someone already in the group', () => {
  it('asks first, then adds anyway with confirmNew', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': tripView(), 'POST /api/trips/t-1/people': { participantId: 'p-new' } });
    renderAt(<People />, at);
    const input = await screen.findByRole('textbox', { name: /name/i });
    await userEvent.type(input, 'Bình Anh');
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(await screen.findByText(/"Bình Anh" looks like "Bình"/)).toBeInTheDocument();
    expect(addCalls(calls)).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
    await waitFor(() => expect(addCalls(calls)[0]?.body).toEqual({ name: 'Bình Anh', confirmNew: true }));
  });

  it('a name like nobody else is added straight away', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': tripView(), 'POST /api/trips/t-1/people': { participantId: 'p-new' } });
    renderAt(<People />, at);
    await userEvent.type(await screen.findByRole('textbox', { name: /name/i }), 'Quang');
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await waitFor(() => expect(addCalls(calls)[0]?.body).toEqual({ name: 'Quang' }));
  });
});
