import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView, TagView, TripView, WalletView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const ledger = { tripId: 't-led', ownerPid: 'p-me' };
const cash: WalletView = { id: 'w-1', name: 'Tiền mặt', currency: 'VND', balance: 2320000, isDefault: true };

const starterCategories: CategoryView[] = [
  { id: 'c-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'receipt', hidden: false, sortOrder: 0 },
  { id: 'c-invest', parentId: null, type: 'expense', name: 'Đầu tư', icon: 'pie', hidden: false, sortOrder: 1 },
  { id: 'c-stock', parentId: 'c-invest', type: 'expense', name: 'Cổ phiếu', icon: 'pie', hidden: false, sortOrder: 0 },
  { id: 'c-gold', parentId: 'c-invest', type: 'expense', name: 'Vàng', icon: 'star', hidden: false, sortOrder: 1 },
  { id: 'c-salary', parentId: null, type: 'income', name: 'Lương', icon: 'wallet', hidden: false, sortOrder: 0 },
  { id: 'c-interest', parentId: null, type: 'income', name: 'Lãi', icon: 'piggyBank', hidden: false, sortOrder: 1 },
];

const starterTags: TagView[] = [
  { id: 't-work', name: 'công việc', useCount: 5 },
  { id: 't-travel', name: 'du lịch', useCount: 2 },
];

function ledgerView(): TripView {
  return tripView({
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
    },
    me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
    people: [{ id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' }],
    expenses: [],
    payments: [],
  });
}

type Routes = Parameters<typeof mockApi>[0];

function mockApp(routes: Routes = {}) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: [cash] },
    'GET /api/me/personal/summary': { month: '2026-11', totalVnd: 2320000, approximate: false, spent: [], income: [] },
    'GET /api/me/personal/transactions': { rows: [], hasMore: false },
    'GET /api/me/personal/categories': { categories: starterCategories, recentIds: [] },
    'GET /api/me/personal/tags': { tags: starterTags },
    ...routes,
  });
}

describe('Personal settings: Categories & Tags', () => {
  it('gear menu in Sổ chi tiêu header opens ActionSheet with Wallets, Categories, and Tags', async () => {
    const user = userEvent.setup();
    mockApp();
    renderAt(<App />, { route: '/trips' });

    const gearBtn = await screen.findByTestId('personal-settings-btn');
    await user.click(gearBtn);

    expect(await screen.findByRole('button', { name: 'Wallets' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Categories' })).toBeInTheDocument();
    const tagsItem = screen.getByRole('button', { name: 'Tags' });
    await user.click(tagsItem);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/personal\/tags$/));
  });

  it("starter set shows grouped by type with Đầu tư's subs", async () => {
    const user = userEvent.setup();
    mockApp();
    renderAt(<App />, { route: '/personal/categories' });

    expect(await screen.findByText('Ăn uống')).toBeInTheDocument();
    expect(screen.getByText('Đầu tư')).toBeInTheDocument();
    expect(screen.getByText('Cổ phiếu')).toBeInTheDocument();
    expect(screen.getByText('Vàng')).toBeInTheDocument();
    expect(screen.queryByText('Lương')).not.toBeInTheDocument();

    const subRow = screen.getByTestId('category-row-c-stock');
    expect(subRow).toHaveClass('pl-10');

    await user.click(screen.getByRole('tab', { name: 'Income' }));
    expect(await screen.findByText('Lương')).toBeInTheDocument();
    expect(screen.getByText('Lãi')).toBeInTheDocument();
    expect(screen.queryByText('Ăn uống')).not.toBeInTheDocument();
  });

  it('removing a used category asks to move or hide, and the move posts moveTo', async () => {
    const user = userEvent.setup();
    let currentCategories = [...starterCategories];

    const { calls } = mockApp({
      'GET /api/me/personal/categories': () => Response.json({ categories: currentCategories, recentIds: [] }),
      'DELETE /api/me/personal/categories/c-food': (_init: RequestInit | undefined, urlStr: string) => {
        const moveTo = new URL(urlStr, 'http://x').searchParams.get('moveTo');
        if (!moveTo) {
          return Response.json(
            { error: { code: 'IN_USE', message: 'Category is in use.', count: 4 } },
            { status: 409 },
          );
        }
        currentCategories = currentCategories.filter((c) => c.id !== 'c-food');
        return Response.json({ ok: true });
      },
    });

    renderAt(<App />, { route: '/personal/categories' });
    await screen.findByText('Ăn uống');

    const foodRow = screen.getByTestId('category-row-c-food');
    await user.click(within(foodRow).getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByTestId('category-delete-confirm'));

    expect(await screen.findByText('Used by 4 transactions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide category, keep history' })).toBeInTheDocument();

    const moveSelect = screen.getByTestId('category-move-select');
    // Cannot move to itself
    expect(within(moveSelect).queryByRole('option', { name: 'Ăn uống' })).not.toBeInTheDocument();

    await user.selectOptions(moveSelect, 'c-invest');
    await user.click(screen.getByTestId('category-move-confirm'));

    await waitFor(() => expect(screen.queryByText('Ăn uống')).not.toBeInTheDocument());
    expect(
      calls.some(
        (c) => c.method === 'DELETE' && c.path === '/api/me/personal/categories/c-food',
      ),
    ).toBe(true);
  });

  it('a tag rename that clashes says so', async () => {
    const user = userEvent.setup();
    mockApp({
      'PATCH /api/me/personal/tags/t-work': () =>
        Response.json({ error: { code: 'CONFLICT', message: 'Tag already exists.' } }, { status: 409 }),
    });

    renderAt(<App />, { route: '/personal/tags' });
    expect(await screen.findByText('công việc')).toBeInTheDocument();
    expect(screen.getByText('5 transactions')).toBeInTheDocument();

    const workRow = screen.getByTestId('tag-row-t-work');
    await user.click(within(workRow).getByRole('button', { name: 'Rename' }));
    const input = await screen.findByTestId('tag-name-input');
    await user.clear(input);
    await user.type(input, 'du lịch');
    await user.click(screen.getByTestId('tag-save-btn'));

    expect(await screen.findByText('A tag with this name already exists')).toBeInTheDocument();
  });

  it('removing a tag in use confirms first', async () => {
    const user = userEvent.setup();
    let currentTags = [...starterTags];

    const { calls } = mockApp({
      'GET /api/me/personal/tags': () => Response.json({ tags: currentTags }),
      'DELETE /api/me/personal/tags/t-work': () => {
        currentTags = currentTags.filter((t) => t.id !== 't-work');
        return Response.json({ ok: true });
      },
    });

    renderAt(<App />, { route: '/personal/tags' });
    await screen.findByText('công việc');

    const workRow = screen.getByTestId('tag-row-t-work');
    await user.click(within(workRow).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('This tag will be removed from 5 transactions')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getByTestId('tag-delete-confirm'));
    await waitFor(() => expect(screen.queryByText('công việc')).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/me/personal/tags/t-work')).toBe(true);
  });
});
