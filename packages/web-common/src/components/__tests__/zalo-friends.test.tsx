import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import type { ZaloFriend } from '../../platform';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { tripView, PIDS } from '../../test/fixtures';
import { sessionStore } from '../../platform/session';
import { People } from '../../screens/People';
import { CreateTrip } from '../../screens/CreateTrip';

afterEach(() => {
  sessionStore.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const peopleRoute = { route: '/t/t-1/people', path: '/t/:tripId/people' };

describe('ZaloFriendPicker', () => {
  it('hidden on the web', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<People />, peopleRoute);
    await screen.findByRole('button', { name: /^Minh,/ });
    expect(document.querySelector('.fsl-zalo-friends')).toBeNull();
  });

  it('hidden for a member who is not admin', async () => {
    const base = tripView();
    const nonAdminView: TripView = {
      ...base,
      me: {
        kind: 'member',
        participantId: PIDS.B,
        participantPending: false,
        isOrganiser: false,
        isAdmin: false,
      },
    };
    mockApi({ 'GET /api/trips/t-1': nonAdminView });
    const platform = fakePlatform({ kind: 'zmp' });
    renderAt(<People />, { ...peopleRoute, platform });
    await screen.findByRole('button', { name: /^Minh,/ });
    expect(document.querySelector('.fsl-zalo-friends')).toBeNull();
  });

  it('admin picks Dũng and An: An is linked, Dũng is added', async () => {
    const friends: ZaloFriend[] = [
      { zaloId: 'z-dung', name: 'Dũng', avatar: 'https://avatar.test/dung.png' },
      { zaloId: 'z-an', name: 'An', avatar: 'https://avatar.test/an.png' },
    ];
    const platform = fakePlatform({
      kind: 'zmp',
      pickZaloFriends: async () => friends,
    });
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(),
      'POST /api/trips/t-1/people': { id: 'p-dung', name: 'Dũng' },
      'PATCH /api/trips/t-1/people/p-an': { id: 'p-an', name: 'An', zaloLinked: true },
    });

    renderAt(<People />, { ...peopleRoute, platform });
    const pickBtn = await screen.findByRole('button', { name: 'Choose from Zalo friends' });
    expect(pickBtn).toHaveClass('fsl-zalo-friends');
    await userEvent.click(pickBtn);

    // POST /people for Dũng without a match is sent right away
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            c.path === '/api/trips/t-1/people' &&
            (c.body as { name?: string; zaloSub?: string })?.name === 'Dũng' &&
            (c.body as { name?: string; zaloSub?: string })?.zaloSub === 'z-dung',
        ),
      ).toBe(true);
    });

    // The sheet shows the An row
    const sheet = await screen.findByRole('dialog', { name: 'Already in the group?' });
    expect(within(sheet).getByText('Is An the same as An?')).toBeInTheDocument();

    // Tap fsl-zalo-friends__link -> PATCH /people/p-an { zaloSub: 'z-an' }
    const linkBtn = within(sheet).getByRole('button', { name: 'Link to An' });
    expect(linkBtn).toHaveClass('fsl-zalo-friends__link');
    await userEvent.click(linkBtn);

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'PATCH' &&
            c.path === '/api/trips/t-1/people/p-an' &&
            (c.body as { zaloSub?: string })?.zaloSub === 'z-an',
        ),
      ).toBe(true);
    });

    // Sheet closes when no rows are left
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Already in the group?' })).toBeNull();
    });
  });

  it('409 shows already in this group and still adds the others', async () => {
    const friends: ZaloFriend[] = [
      { zaloId: 'z-dung', name: 'Dũng', avatar: '' },
      { zaloId: 'z-hoa', name: 'Hoa', avatar: '' },
    ];
    const platform = fakePlatform({
      kind: 'zmp',
      pickZaloFriends: async () => friends,
    });
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(),
      'POST /api/trips/t-1/people': async (init: RequestInit | undefined) => {
        const body = JSON.parse(String(init?.body));
        if (body.zaloSub === 'z-dung') {
          return Response.json(
            { error: { code: 'CONFLICT', message: 'Already in group' } },
            { status: 409 },
          );
        }
        return Response.json({ id: 'p-hoa', name: 'Hoa' }, { status: 201 });
      },
    });

    renderAt(<People />, { ...peopleRoute, platform });
    const pickBtn = await screen.findByRole('button', { name: 'Choose from Zalo friends' });
    await userEvent.click(pickBtn);

    // 409 shows muted line under the button
    const alreadyMsg = await screen.findByText('Dũng is already in this group');
    expect(alreadyMsg).toHaveClass('fsl-zalo-friends__already');

    // Hoa is still sent
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            c.path === '/api/trips/t-1/people' &&
            (c.body as { name?: string; zaloSub?: string })?.name === 'Hoa' &&
            (c.body as { name?: string; zaloSub?: string })?.zaloSub === 'z-hoa',
        ),
      ).toBe(true);
    });
  });

  it('closing the picker does nothing', async () => {
    const platform = fakePlatform({
      kind: 'zmp',
      pickZaloFriends: async () => null,
    });
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(),
    });

    renderAt(<People />, { ...peopleRoute, platform });
    const pickBtn = await screen.findByRole('button', { name: 'Choose from Zalo friends' });
    await userEvent.click(pickBtn);

    expect(calls.filter((c) => c.method === 'POST' || c.method === 'PATCH')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('create trip sends zaloSub on picked friends', async () => {
    const friends: ZaloFriend[] = [
      { zaloId: 'z-dung', name: 'Dũng', avatar: '' },
    ];
    const platform = fakePlatform({
      kind: 'zmp',
      pickZaloFriends: async () => friends,
    });
    const { calls } = mockApi({
      'GET /api/me': {
        user: {
          id: 'u-1',
          name: 'Minh',
          email: 'minh@example.com',
          consentAt: '2026-01-01',
          providers: ['zalo'],
        },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/me/people': [],
      'POST /api/trips': { tripId: 't-new' },
    });

    renderAt(<CreateTrip />, { route: '/trips/new', path: '/trips/new', platform });
    const pickBtn = await screen.findByRole('button', { name: 'Choose from Zalo friends' });
    await userEvent.click(pickBtn);

    // Picked friend appears in list
    expect(await screen.findByDisplayValue('Dũng')).toBeInTheDocument();

    // Fill trip name and user name
    const tripNameInput = screen.getByLabelText('Group name');
    await userEvent.type(tripNameInput, 'Đà Lạt');
    const myNameInput = screen.getByLabelText('Your name');
    await userEvent.clear(myNameInput);
    await userEvent.type(myNameInput, 'Minh');

    const submitBtn = screen.getByRole('button', { name: 'Create group' });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      const createCall = calls.find((c) => c.method === 'POST' && c.path === '/api/trips');
      expect(createCall).toBeDefined();
      const body = createCall?.body as { people?: { name: string; zaloSub?: string }[] };
      expect(body.people).toContainEqual(
        expect.objectContaining({ name: 'Dũng', zaloSub: 'z-dung' }),
      );
    });
  });

  it('admin can choose to add as new instead of linking', async () => {
    const friends: ZaloFriend[] = [
      { zaloId: 'z-an', name: 'An', avatar: 'https://avatar.test/an.png' },
    ];
    const platform = fakePlatform({
      kind: 'zmp',
      pickZaloFriends: async () => friends,
    });
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(),
      'POST /api/trips/t-1/people': { id: 'p-an-2', name: 'An' },
    });

    renderAt(<People />, { ...peopleRoute, platform });
    const pickBtn = await screen.findByRole('button', { name: 'Choose from Zalo friends' });
    await userEvent.click(pickBtn);

    const sheet = await screen.findByRole('dialog', { name: 'Already in the group?' });
    const addBtn = within(sheet).getByRole('button', { name: 'Add as new' });
    expect(addBtn).toHaveClass('fsl-zalo-friends__add');
    await userEvent.click(addBtn);

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            c.path === '/api/trips/t-1/people' &&
            (c.body as { name?: string; zaloSub?: string })?.name === 'An' &&
            (c.body as { name?: string; zaloSub?: string })?.zaloSub === 'z-an',
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Already in the group?' })).toBeNull();
    });
  });
});
