import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { tripView, PIDS } from '../../test/fixtures';
import { resetChatRouteForTests } from '../../platform/useChatRoute';
import { App } from '../../App';
import { CreateTrip } from '../../screens/CreateTrip';
import { Settings } from '../../screens/Settings';

function LocationWithSearch() {
  const loc = useLocation();
  return <div data-testid="full-location">{loc.pathname + loc.search}</div>;
}

beforeEach(() => {
  resetChatRouteForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Zalo chat linking', () => {
  it('linked chat and member opens the group', async () => {
    const fake = fakePlatform({
      chatContext: async () => ({ type: 'group', id: 'chat-1' }),
    });
    mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/zalo/chats/chat-1': {
        linked: true,
        tripId: 't-1',
        tripName: 'Trip 1',
        joinToken: 'gtok-1',
        isMember: true,
      },
      'GET /api/trips/t-1': tripView(),
    });

    renderAt(<App />, { platform: fake });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1');
    });
  });

  it('after the chat redirect, the landing page redirects signed-in users again', async () => {
    const { useChatRoutePending } = await import('../../platform/useChatRoute');
    let pendingNow = true;
    function PendingProbe() {
      pendingNow = useChatRoutePending();
      return null;
    }
    const fake = fakePlatform({
      chatContext: async () => ({ type: 'group', id: 'chat-1' }),
    });
    mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/zalo/chats/chat-1': { linked: true, tripId: 't-1', tripName: 'Trip 1', joinToken: 'gtok-1', isMember: true },
      'GET /api/trips/t-1': tripView(),
    });

    renderAt(<><App /><PendingProbe /></>, { platform: fake });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
    await waitFor(() => expect(pendingNow).toBe(false));
  });

  it('linked chat and not a member opens the join page', async () => {
    const fake = fakePlatform({
      chatContext: async () => ({ type: 'group', id: 'chat-1' }),
    });
    mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/zalo/chats/chat-1': {
        linked: true,
        tripId: 't-1',
        tripName: 'Trip 1',
        joinToken: 'gtok-1',
        isMember: false,
      },
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Trip 1', access: 'group' },
    });

    renderAt(<App />, { platform: fake });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/j/gtok-1');
    });
  });

  it('unlinked chat: choosing a group links it', async () => {
    const fake = fakePlatform({
      chatContext: async () => ({ type: 'group', id: 'chat-1' }),
    });
    const { calls } = mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/zalo/chats/chat-1': { linked: false },
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt Trip', archived: false, myBalance: 0 },
        { id: 't-archived', name: 'Archived Trip', archived: true, myBalance: 0 },
        { id: 't-direct', name: 'Direct Expense', archived: false, myBalance: 0, preset: 'direct' },
      ],
      'POST /api/zalo/chats/chat-1/link': null,
      'GET /api/trips/t-1': tripView(),
    });

    renderAt(<App />, { platform: fake });

    const groupBtn = await screen.findByRole('button', { name: 'Đà Lạt Trip' });
    expect(screen.queryByRole('button', { name: 'Archived Trip' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Direct Expense' })).not.toBeInTheDocument();

    await userEvent.click(groupBtn);

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/zalo/chats/chat-1/link')).toBe(true);
    });

    const linkCall = calls.find((c) => c.method === 'POST' && c.path === '/api/zalo/chats/chat-1/link');
    expect(linkCall?.body).toEqual({ tripId: 't-1' });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1');
    });
  });

  it('unlinked chat: create new group', async () => {
    const fake = fakePlatform({
      chatContext: async () => ({ type: 'group', id: 'chat-1' }),
    });
    mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/zalo/chats/chat-1': { linked: false },
      'GET /api/trips': [],
    });

    renderAt(<><App /><LocationWithSearch /></>, { platform: fake });

    const createBtn = await screen.findByRole('button', { name: 'Create a new group' });
    await userEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByTestId('full-location')).toHaveTextContent('/trips/new?zaloChat=chat-1');
    });
  });

  it('link failure keeps the sheet with the error text', async () => {
    const fake = fakePlatform({
      chatContext: async () => ({ type: 'group', id: 'chat-1' }),
    });
    mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/zalo/chats/chat-1': { linked: false },
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt Trip', archived: false, myBalance: 0 },
      ],
      'POST /api/zalo/chats/chat-1/link': () =>
        Response.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 }),
    });

    renderAt(<App />, { platform: fake });

    const groupBtn = await screen.findByRole('button', { name: 'Đà Lạt Trip' });
    await userEvent.click(groupBtn);

    expect(
      await screen.findByText(
        "Couldn't link this chat. Only members can link it, and a chat linked to another group needs that group's admin.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Đà Lạt Trip' })).toBeInTheDocument();
  });

  it('guest sees Zalo sign-in in the sheet', async () => {
    const fake = fakePlatform({
      chatContext: async () => ({ type: 'group', id: 'chat-1' }),
    });
    mockApi({
      'GET /api/me': {
        user: null,
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/zalo/chats/chat-1': { linked: false },
    });

    renderAt(<App />, { platform: fake });

    expect(
      await screen.findByText('Sign in to link this chat to one of your groups.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with your Zalo account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create a new group' })).not.toBeInTheDocument();
  });

  it('web platform makes no lookup request', async () => {
    const fake = fakePlatform({
      kind: 'web',
      chatContext: async () => ({ type: 'group', id: 'chat-1' }),
    });
    const { calls } = mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
    });

    renderAt(<App />, { platform: fake });

    await waitFor(() => {
      expect(calls.some((c) => c.path === '/api/me')).toBe(true);
    });

    expect(calls.some((c) => c.path.includes('/api/zalo/chats'))).toBe(false);
  });

  it('chatContext null makes no lookup request', async () => {
    const fake = fakePlatform({
      kind: 'zmp',
      chatContext: async () => null,
    });
    const { calls } = mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
    });

    renderAt(<App />, { platform: fake });

    await waitFor(() => {
      expect(calls.some((c) => c.path === '/api/me')).toBe(true);
    });

    expect(calls.some((c) => c.path.includes('/api/zalo/chats'))).toBe(false);
  });

  it('create trip with ?zaloChat links the new group', async () => {
    const fake = fakePlatform();
    const { calls } = mockApi({
      'GET /api/me': {
        user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-10-12T00:00:00.000Z' },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'POST /api/trips': () => Response.json({ tripId: 't-new' }, { status: 201 }),
      'POST /api/zalo/chats/chat-1/link': null,
      'GET /api/trips/t-new': tripView(),
    });

    renderAt(<CreateTrip />, {
      route: '/trips/new?zaloChat=chat-1',
      platform: fake,
    });

    expect(await screen.findByLabelText('Your name')).toHaveValue('An');
    await userEvent.type(screen.getByLabelText('Group name'), 'Saigon Weekend');
    await userEvent.type(screen.getAllByPlaceholderText('Name')[0]!, 'Bình');
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips')).toBe(true);
    });

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/zalo/chats/chat-1/link')).toBe(true);
    });

    const linkCall = calls.find((c) => c.method === 'POST' && c.path === '/api/zalo/chats/chat-1/link');
    expect(linkCall?.body).toEqual({ tripId: 't-new' });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-new');
    });
  });

  it('settings lists a linked chat for an admin and unlinks it', async () => {
    const fake = fakePlatform({ kind: 'zmp' });
    const view = tripView();
    const adminView = {
      ...view,
      me: { ...view.me, participantId: PIDS.A, isOrganiser: true, isAdmin: true },
    };

    let zaloChatsList: { chatId: string; createdAt: string }[] = [
      { chatId: 'chat-1', createdAt: '2026-11-01T10:00:00.000Z' },
    ];

    const { calls } = mockApi({
      'GET /api/trips/t-1': adminView,
      'GET /api/trips/t-1/zalo-chats': () => Response.json({ chats: zaloChatsList }),
      'DELETE /api/zalo/chats/chat-1': () => {
        zaloChatsList = [];
        return new Response(null, { status: 204 });
      },
    });

    renderAt(<Settings />, {
      route: '/t/t-1/settings',
      path: '/t/:tripId/settings',
      platform: fake,
    });

    expect(await screen.findByText('Linked Zalo chats')).toBeInTheDocument();
    expect(screen.getByText('Zalo group chat')).toBeInTheDocument();

    const unlinkBtn = screen.getByRole('button', { name: 'Unlink' });
    await userEvent.click(unlinkBtn);

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/zalo/chats/chat-1')).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByText('Linked Zalo chats')).not.toBeInTheDocument();
    });
  });
});
