import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MergeCandidate, PersonKey } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { MergePicker } from '../MergePicker';

afterEach(() => {
  vi.unstubAllGlobals();
});

const defaultPerson = {
  key: 'p:p-a' as PersonKey,
  groups: [
    {
      tripId: 't-dl',
      tripName: 'Đà Lạt',
      kind: 'group' as const,
      participantId: 'p-a',
      name: 'Minh',
      canRename: true,
    },
  ],
};

const candidateMinhN: MergeCandidate = {
  key: 'p:p-mn' as PersonKey,
  name: 'Minh N',
  nickname: null,
  avatarUrl: null,
  signIn: null,
  groups: [{ tripId: 't-dl', tripName: 'Đà Lạt', kind: 'group' }],
  similar: true,
  plan: {
    ok: true,
    tag: 'merge',
    steps: [
      {
        kind: 'merge',
        tripId: 't-dl',
        tripName: 'Đà Lạt',
        fromPid: 'p-mn',
        intoPid: 'p-a',
      },
    ],
  },
};

const candidateMai: MergeCandidate = {
  key: 'p:p-mai' as PersonKey,
  name: 'Mai',
  nickname: null,
  avatarUrl: null,
  signIn: null,
  groups: [],
  similar: false,
  plan: {
    ok: true,
    tag: 'link',
    steps: [{ kind: 'link' }],
  },
};

describe('MergePicker', () => {
  it('shows suggested section first with tags', async () => {
    const onMerged = vi.fn();
    mockApi({
      'GET /api/me/people/p%3Ap-a/merge-options': {
        person: defaultPerson,
        candidates: [candidateMinhN, candidateMai],
      },
    });

    renderAt(
      <MergePicker
        person={{ key: 'p:p-a' as PersonKey, name: 'Minh' }}
        open
        onClose={vi.fn()}
        onMerged={onMerged}
      />,
    );

    const suggested = await screen.findByText('Looks like Minh');
    const everyone = screen.getByText('Everyone else');

    expect(
      suggested.compareDocumentPosition(everyone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByText('Merges in Đà Lạt for everyone')).toBeVisible();
    expect(screen.getByText('Only for you')).toBeVisible();
  });

  it('search filters to one list', async () => {
    const user = userEvent.setup();
    const onMerged = vi.fn();
    mockApi({
      'GET /api/me/people/p%3Ap-a/merge-options': {
        person: defaultPerson,
        candidates: [candidateMinhN, candidateMai],
      },
    });

    renderAt(
      <MergePicker
        person={{ key: 'p:p-a' as PersonKey, name: 'Minh' }}
        open
        onClose={vi.fn()}
        onMerged={onMerged}
      />,
    );

    const searchInput = await screen.findByTestId('merge-search');
    await user.type(searchInput, 'mai');

    expect(screen.getByTestId('merge-pick-p:p-mai')).toBeVisible();
    expect(screen.queryByTestId('merge-pick-p:p-mn')).toBeNull();
    expect(screen.queryByText('Looks like Minh')).toBeNull();
  });

  it('blocked row is disabled with reason', async () => {
    const candidateBlocked: MergeCandidate = {
      key: 'p:p-blocked' as PersonKey,
      name: 'Blocked Person',
      nickname: null,
      avatarUrl: null,
      signIn: null,
      groups: [],
      similar: false,
      plan: {
        ok: false,
        block: { reason: 'both_signed_in' },
      },
    };

    mockApi({
      'GET /api/me/people/p%3Ap-a/merge-options': {
        person: defaultPerson,
        candidates: [candidateBlocked],
      },
    });

    renderAt(
      <MergePicker
        person={{ key: 'p:p-a' as PersonKey, name: 'Minh' }}
        open
        onClose={vi.fn()}
        onMerged={vi.fn()}
      />,
    );

    const rowBtn = await screen.findByTestId('merge-pick-p:p-blocked');
    expect(rowBtn).toBeDisabled();
    expect(screen.getByText('Both have accounts')).toBeVisible();
  });

  it('confirm posts keys [A, B] and calls onMerged', async () => {
    const user = userEvent.setup();
    const onMerged = vi.fn();
    const { calls } = mockApi({
      'GET /api/me/people/p%3Ap-a/merge-options': {
        person: defaultPerson,
        candidates: [candidateMai],
      },
      'POST /api/me/people/merge': { key: 'p:p-a', proposals: [] },
    });

    renderAt(
      <MergePicker
        person={{ key: 'p:p-a' as PersonKey, name: 'Minh' }}
        open
        onClose={vi.fn()}
        onMerged={onMerged}
      />,
    );

    const pickBtn = await screen.findByTestId('merge-pick-p:p-mai');
    await user.click(pickBtn);

    const confirmBtn = await screen.findByTestId('merge-confirm');
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(onMerged).toHaveBeenCalledWith({ key: 'p:p-a', proposals: [] });
    });

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/people/merge',
    );
    expect(postCall).toBeDefined();
    expect(postCall?.body).toEqual({ keys: ['p:p-a', 'p:p-mai'] });
  });

  it('error stays in the sheet', async () => {
    const user = userEvent.setup();
    const onMerged = vi.fn();
    mockApi({
      'GET /api/me/people/p%3Ap-a/merge-options': {
        person: defaultPerson,
        candidates: [candidateMai],
      },
      'POST /api/me/people/merge': () =>
        Response.json(
          {
            code: 'ALREADY_HANDLED',
            error: { code: 'ALREADY_HANDLED', message: 'Already handled' },
          },
          { status: 409 },
        ),
    });

    renderAt(
      <MergePicker
        person={{ key: 'p:p-a' as PersonKey, name: 'Minh' }}
        open
        onClose={vi.fn()}
        onMerged={onMerged}
      />,
    );

    const pickBtn = await screen.findByTestId('merge-pick-p:p-mai');
    await user.click(pickBtn);

    const confirmBtn = await screen.findByTestId('merge-confirm');
    await user.click(confirmBtn);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('merge-confirm')).toBeInTheDocument();
    expect(onMerged).not.toHaveBeenCalled();
  });
});
