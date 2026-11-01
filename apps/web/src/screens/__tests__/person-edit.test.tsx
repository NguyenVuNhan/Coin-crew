import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonSummary } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { PersonScreen } from '../PersonScreen';

const me = (consentAt: string | null = '2026-10-12T00:00:00.000Z') => ({
  user: { id: 'u-minh', email: 'minh@example.com', name: 'Minh', consentAt },
});

const minh: PersonSummary = {
  key: 'u:u-minh',
  name: 'Minh',
  nickname: null,
  userId: 'u-minh',
  groupLabel: null,
  total: 270000,
  items: [],
  waiting: [],
  linked: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('person edit', () => {
  it('shows a large avatar and an edit icon next to the name', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [minh] },
    });

    renderAt(<PersonScreen />, {
      route: '/people/u%3Au-minh',
      path: '/people/:key',
    });

    expect(await screen.findByTestId('person-edit')).toBeInTheDocument();
    expect(screen.getByTestId('person-edit')).toBeInTheDocument();
    expect(screen.queryByText('Edit nickname')).toBeNull();
    expect(document.querySelector('.fsl-avatar--xl')).toBeInTheDocument();
  });

  it('admin sees a name field per group and saving renames', async () => {
    const guest: PersonSummary = {
      key: 'p:p-1',
      name: 'Minh',
      nickname: null,
      userId: null,
      groupLabel: 'Đà Lạt',
      total: 0,
      items: [],
      waiting: [],
      linked: [],
    };

    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [guest] },
      'GET /api/me/people/p%3Ap-1/merge-options': {
        person: {
          key: 'p:p-1',
          groups: [
            {
              tripId: 't-dl',
              tripName: 'Đà Lạt',
              kind: 'group',
              participantId: 'p-1',
              name: 'Minh',
              canRename: true,
            },
          ],
        },
        candidates: [],
      },
      'PATCH /api/trips/t-dl/people/p-1': null,
    });

    renderAt(<PersonScreen />, {
      route: '/people/p%3Ap-1',
      path: '/people/:key',
    });

    const editBtn = await screen.findByTestId('person-edit');
    await userEvent.click(editBtn);

    const nameInput = await screen.findByTestId('person-name-t-dl');
    expect(nameInput).toHaveValue('Minh');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Minh Béo');

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'PATCH',
            path: '/api/trips/t-dl/people/p-1',
            body: { name: 'Minh Béo' },
          }),
        ]),
      );
    });
  });

  it('non-admin sees only the nickname field', async () => {
    const guest: PersonSummary = {
      key: 'p:p-1',
      name: 'Minh',
      nickname: null,
      userId: null,
      groupLabel: 'Đà Lạt',
      total: 0,
      items: [],
      waiting: [],
      linked: [],
    };

    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [guest] },
      'GET /api/me/people/p%3Ap-1/merge-options': {
        person: {
          key: 'p:p-1',
          groups: [
            {
              tripId: 't-dl',
              tripName: 'Đà Lạt',
              kind: 'group',
              participantId: 'p-1',
              name: 'Minh',
              canRename: false,
            },
          ],
        },
        candidates: [],
      },
    });

    renderAt(<PersonScreen />, {
      route: '/people/p%3Ap-1',
      path: '/people/:key',
    });

    const editBtn = await screen.findByTestId('person-edit');
    await userEvent.click(editBtn);

    expect(await screen.findByText('Đà Lạt: Minh')).toBeInTheDocument();
    expect(screen.queryByTestId('person-name-t-dl')).toBeNull();
  });

  it('no Rename or merge in link on the page', async () => {
    const guest: PersonSummary = {
      key: 'p:p-1',
      name: 'Minh',
      nickname: null,
      userId: null,
      groupLabel: 'Đà Lạt',
      total: 0,
      items: [
        {
          tripId: 't-dl',
          tripName: 'Đà Lạt',
          kind: 'group',
          amount: 50000,
          oldestOpenAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      waiting: [],
      linked: [],
    };

    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [guest] },
    });

    renderAt(<PersonScreen />, {
      route: '/people/p%3Ap-1',
      path: '/people/:key',
    });

    await screen.findByTestId('person-edit');
    expect(screen.queryByRole('link', { name: /Rename or merge in/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rename or merge in/i })).toBeNull();
    expect(screen.queryByText(/Rename or merge in/i)).toBeNull();
  });
});
