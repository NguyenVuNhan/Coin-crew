import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { People } from '../People';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = { route: '/t/t-1/people', path: '/t/:tripId/people' };
const addCalls = (calls: { method: string; path: string; body?: unknown }[]) =>
  calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/people');

/** The trip API before and after the add: the new person shows up once the POST has run. */
function groupThatGrows(name: string) {
  let added = false;
  const grown = (): TripView => {
    const v = tripView();
    return { ...v, people: [...v.people, { id: 'p-new', name, status: 'active', isMember: false, bank: 'none' }] };
  };
  return {
    'GET /api/trips/t-1': () => Response.json(added ? grown() : tripView()),
    'POST /api/trips/t-1/people': () => {
      added = true;
      return Response.json({ participantId: 'p-new' }, { status: 201 });
    },
  };
}

const likeHint = () => screen.getByText('Like Bình?').closest('.fsl-people__like') as HTMLElement;

describe('Adding a name that looks like someone already in the group', () => {
  it('a look-alike is added straight away, with a Merge hint', async () => {
    const { calls } = mockApi(groupThatGrows('Bình Anh'));
    renderAt(<People />, at);
    await userEvent.type(await screen.findByLabelText('Name to add'), 'Bình Anh{Enter}');
    await waitFor(() => expect(addCalls(calls)[0]?.body).toEqual({ name: 'Bình Anh' }));
    expect(await screen.findByText('Like Bình?')).toBeInTheDocument();
  });

  it('Merge offers to move the new person into the look-alike', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = mockApi({ ...groupThatGrows('Bình Anh'), 'POST /api/trips/t-1/people/merge': null });
    renderAt(<People />, at);
    await userEvent.type(await screen.findByLabelText('Name to add'), 'Bình Anh{Enter}');
    await screen.findByText('Like Bình?');
    await userEvent.click(within(likeHint()).getByRole('button', { name: 'Merge' }));
    expect(confirm).toHaveBeenCalledWith('Move every expense and payment from Bình Anh to Bình?');
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/api/trips/t-1/people/merge')?.body).toEqual({ fromId: 'p-new', intoId: PIDS.B }),
    );
    await waitFor(() => expect(screen.queryByText('Like Bình?')).not.toBeInTheDocument());
  });

  it('the hint can be dismissed', async () => {
    const { calls } = mockApi(groupThatGrows('Bình Anh'));
    renderAt(<People />, at);
    await userEvent.type(await screen.findByLabelText('Name to add'), 'Bình Anh{Enter}');
    await screen.findByText('Like Bình?');
    await userEvent.click(within(likeHint()).getByRole('button', { name: 'Not the same person' }));
    expect(screen.queryByText('Like Bình?')).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/trips/t-1/people/merge')).toBe(false);
  });

  it('a name like nobody else is added straight away, without a hint', async () => {
    const { calls } = mockApi(groupThatGrows('Quang'));
    renderAt(<People />, at);
    await userEvent.type(await screen.findByLabelText('Name to add'), 'Quang{Enter}');
    await waitFor(() => expect(addCalls(calls)[0]?.body).toEqual({ name: 'Quang' }));
    expect(await screen.findByText('Quang')).toBeInTheDocument();
    expect(screen.queryByText(/^Like /)).not.toBeInTheDocument();
  });
});
