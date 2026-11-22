import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoriesResponse, GroupRow, TagView, WalletDetailView } from '@cc/core';
import { mockApi, renderAt } from '../../test/render';
import { GroupRowSheet } from '../GroupRowSheet';

afterEach(() => {
  vi.unstubAllGlobals();
});

const wallet: WalletDetailView = {
  id: 'w-bank',
  name: 'Techcombank',
  kind: 'everyday',
  currency: 'VND',
  balance: 1_000_000,
  startAmount: 1_000_000,
  startDate: '2026-10-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  isDefault: true,
  entryCount: 0,
};

const categories: CategoriesResponse = {
  categories: [
    { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
  ],
  recentIds: [],
};

const tags: TagView[] = [{ id: 't-dalat', name: 'dalat', useCount: 4 }];

function row(link: GroupRow['link']): GroupRow {
  return {
    kind: 'group',
    activityAt: '2026-11-15T12:00:00Z',
    id: 'tx-1',
    rootId: 'root-1',
    tripId: 'trip-dl',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-15',
    title: 'Ăn tối',
    total: 300_000,
    myShare: 100_000,
    iPaid: true,
    payerName: 'Nhan',
    counterpartName: null,
    people: ['Minh', 'Hùng'],
    pending: false,
    link,
    createdAt: '2026-11-15T12:00:00Z',
  };
}

/** Lets the test swap in the row a list reload brings back, the way TransactionsScreen re-renders the sheet. */
function Harness() {
  const [current, setCurrent] = useState<GroupRow>(row(null));
  return (
    <>
      <button
        type="button"
        data-testid="stale-reload"
        onClick={() =>
          // The reload started by the category save: it has the category but not the tag added since.
          setCurrent(
            row({ walletId: null, categoryId: 'cat-food', tagIds: [], intent: null, excludeFromReports: false }),
          )
        }
      />
      <GroupRowSheet row={current} open onClose={vi.fn()} />
    </>
  );
}

describe('GroupRowSheet with a list reload landing late', () => {
  it('keeps a tag added after a category save when the reload from that save arrives afterwards', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [wallet] },
      'GET /api/me/personal/categories': categories,
      'GET /api/me/personal/tags': { tags },
      'GET /api/me/personal/group-settings': {
        settings: { defaultGroupCategoryId: null, countLoans: false },
      },
      'PUT /api/me/personal/group-links/root-1': (init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return Response.json({
          link: {
            walletId: null,
            categoryId: 'cat-food',
            tagIds: body.tagIds ?? [],
            intent: null,
            excludeFromReports: false,
          },
        });
      },
    });

    renderAt(<Harness />);
    await screen.findByTestId('group-row-sheet');

    await user.click(screen.getByTestId('group-row-field-tags'));
    await user.type(await screen.findByTestId('tag-input-field'), 'dalat{Enter}');
    await waitFor(() => expect(screen.getByTestId('group-row-field-tags')).toHaveTextContent('#dalat'));

    act(() => {
      fireEvent.click(screen.getByTestId('stale-reload'));
    });

    expect(screen.getByTestId('group-row-field-tags')).toHaveTextContent('#dalat');
    expect(screen.getByTestId('group-row-field-tags')).toHaveAttribute('aria-expanded', 'true');
  });
});
