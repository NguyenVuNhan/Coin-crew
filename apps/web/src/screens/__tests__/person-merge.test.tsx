import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonSummary } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { PersonScreen } from '../PersonScreen';

const me = () => ({
  user: { id: 'u-owner', email: 'owner@example.com', name: 'Owner', consentAt: '2026-10-12T00:00:00.000Z' },
});

const guestMinh: PersonSummary = {
  key: 'p:p-minh',
  name: 'Minh',
  nickname: null,
  userId: null,
  groupLabel: 'Đà Lạt',
  total: 50000,
  items: [
    {
      tripId: 't-dl',
      tripName: 'Đà Lạt',
      kind: 'group',
      amount: 50000,
      oldestOpenAt: '2026-10-01T00:00:00.000Z',
      ownerPid: 'dl-o',
      otherPid: 'dl-m',
    },
  ],
  waiting: [],
  linked: [],
};

const candidateMinhN: PersonSummary = {
  key: 'p:p-minhn',
  name: 'Minh N',
  nickname: null,
  userId: null,
  groupLabel: 'Đà Lạt',
  total: 20000,
  items: [
    {
      tripId: 't-dl',
      tripName: 'Đà Lạt',
      kind: 'group',
      amount: 20000,
      oldestOpenAt: '2026-10-01T00:00:00.000Z',
      ownerPid: 'dl-o',
      otherPid: 'dl-mn',
    },
  ],
  waiting: [],
  linked: [],
};

const candidateLinh: PersonSummary = {
  key: 'p:p-linh',
  name: 'Linh',
  nickname: null,
  userId: null,
  groupLabel: 'Đà Lạt',
  total: 10000,
  items: [
    {
      tripId: 't-dl',
      tripName: 'Đà Lạt',
      kind: 'group',
      amount: 10000,
      oldestOpenAt: '2026-10-01T00:00:00.000Z',
      ownerPid: 'dl-o',
      otherPid: 'dl-l',
    },
  ],
  waiting: [],
  linked: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PersonScreen merge & unmerge', () => {
  it('merge sheet lists everyone, similar names first', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': {
        incomplete: false,
        // Candidate "Linh" placed before "Minh N" in API to verify sorting puts "Minh N" first
        people: [guestMinh, candidateLinh, candidateMinhN],
      },
      'POST /api/me/people/link': { key: 'p:p-merged' },
    });

    renderAt(<PersonScreen />, {
      route: '/people/p%3Ap-minh',
      path: '/people/:key',
    });

    const mergeBtn = await screen.findByTestId('person-merge');
    await userEvent.click(mergeBtn);

    const pickMinhN = await screen.findByTestId('merge-pick-p:p-minhn');
    const pickLinh = screen.getByTestId('merge-pick-p:p-linh');

    // "Minh N" row comes before "Linh"
    const picks = screen.getAllByTestId(/^merge-pick-/);
    const pickIds = picks.map((el) => el.getAttribute('data-testid'));
    expect(pickIds.indexOf('merge-pick-p:p-minhn')).toBeLessThan(pickIds.indexOf('merge-pick-p:p-linh'));

    // tapping it posts /api/me/people/link with { keys: ['p:p-minh', 'p:p-minhn'] }
    await userEvent.click(pickMinhN);

    await waitFor(() => {
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'POST',
            path: '/api/me/people/link',
            body: { keys: ['p:p-minh', 'p:p-minhn'] },
          }),
        ]),
      );
    });

    // and navigates to /people/<returned key>
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/people/p%3Ap-merged');
    });
  });

  it('signed-in candidates are disabled when this person is signed in', async () => {
    const signedInPerson: PersonSummary = {
      key: 'u:u-minh',
      name: 'Minh',
      nickname: null,
      userId: 'u-minh',
      groupLabel: null,
      total: 50000,
      items: [],
      waiting: [],
      linked: [],
    };

    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': {
        incomplete: false,
        people: [signedInPerson, candidateMinhN],
      },
    });

    renderAt(<PersonScreen />, {
      route: '/people/u%3Au-minh',
      path: '/people/:key',
    });

    expect(await screen.findByRole('heading', { level: 2, name: 'Minh' })).toBeInTheDocument();

    // for a u: person, the person-merge button is absent
    expect(screen.queryByTestId('person-merge')).not.toBeInTheDocument();
  });

  it('linked entries can be split off', async () => {
    const personWithLinked: PersonSummary = {
      ...guestMinh,
      linked: [
        {
          participantId: 'g-minh',
          name: 'Minh',
          tripName: 'Đà Lạt',
          kind: 'group',
        },
      ],
    };

    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': {
        incomplete: false,
        people: [personWithLinked],
      },
      'DELETE /api/me/people/link/g-minh': null,
    });

    renderAt(<PersonScreen />, {
      route: '/people/p%3Ap-minh',
      path: '/people/:key',
    });

    expect(await screen.findByText('Merged here')).toBeInTheDocument();
    expect(screen.getByText('Minh · Đà Lạt')).toBeInTheDocument();

    const unmergeBtn = screen.getByTestId('unmerge-g-minh');
    expect(unmergeBtn).toHaveTextContent('Split Minh off');

    await userEvent.click(unmergeBtn);

    await waitFor(() => {
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'DELETE',
            path: '/api/me/people/link/g-minh',
          }),
        ]),
      );
    });
  });
});
