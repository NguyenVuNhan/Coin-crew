import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView, GroupSettingsView } from '@cc/core';
import { mockApi, renderAt } from '../../test/render';
import { PersonalSettingsMenu } from '../PersonalSettingsMenu';

const CATEGORIES: CategoryView[] = [
  {
    id: 'cat-group',
    parentId: null,
    type: 'expense',
    name: 'Nhóm',
    icon: 'users',
    hidden: false,
    sortOrder: 0,
  },
  {
    id: 'cat-travel',
    parentId: null,
    type: 'expense',
    name: 'Du lịch',
    icon: 'plane',
    hidden: false,
    sortOrder: 1,
  },
  {
    id: 'cat-salary',
    parentId: null,
    type: 'income',
    name: 'Lương',
    icon: 'wallet',
    hidden: false,
    sortOrder: 2,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PersonalSettingsMenu - group settings', () => {
  it('shows current group category and count-loans switch (off by default)', async () => {
    const user = userEvent.setup();
    const settings: GroupSettingsView = {
      defaultGroupCategoryId: 'cat-group',
      countLoans: false,
    };

    mockApi({
      'GET /api/me/personal/group-settings': { settings },
      'GET /api/me/personal/categories': { categories: CATEGORIES },
    });

    renderAt(<PersonalSettingsMenu />);
    await user.click(await screen.findByTestId('personal-settings-btn'));

    expect(await screen.findByText('Category for group items')).toBeInTheDocument();
    expect(screen.getByTestId('personal-settings-group-category')).toHaveAccessibleDescription(/\S/);
    expect(await screen.findByTestId('personal-settings-group-category-value')).toHaveTextContent(
      'Nhóm',
    );

    const sw = screen.getByRole('switch', { name: 'Count loans in spending' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('opens expense category picker and sends PUT when changing group category', async () => {
    const user = userEvent.setup();
    let settings: GroupSettingsView = {
      defaultGroupCategoryId: 'cat-group',
      countLoans: false,
    };

    const { calls } = mockApi({
      'GET /api/me/personal/group-settings': () => Response.json({ settings }),
      'GET /api/me/personal/categories': { categories: CATEGORIES },
      'PUT /api/me/personal/group-settings': async (init?: RequestInit) => {
        const body = init?.body ? (JSON.parse(String(init.body)) as Partial<GroupSettingsView>) : {};
        settings = { ...settings, ...body };
        return Response.json({ settings });
      },
    });

    renderAt(<PersonalSettingsMenu />);
    await user.click(await screen.findByTestId('personal-settings-btn'));
    await user.click(await screen.findByTestId('personal-settings-group-category'));

    expect(await screen.findByTestId('category-picker')).toBeInTheDocument();
    expect(screen.getByTestId('category-tile-cat-travel')).toBeInTheDocument();
    expect(screen.queryByTestId('category-tile-cat-salary')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('category-tile-cat-travel'));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        path: '/api/me/personal/group-settings',
        body: { defaultGroupCategoryId: 'cat-travel' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('personal-settings-group-category-value')).toHaveTextContent(
        'Du lịch',
      ),
    );
  });

  it('toggling count-loans shows pending state, disables switch, and sends PUT', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let settings: GroupSettingsView = {
      defaultGroupCategoryId: 'cat-group',
      countLoans: false,
    };

    const { calls } = mockApi({
      'GET /api/me/personal/group-settings': () => Response.json({ settings }),
      'GET /api/me/personal/categories': { categories: CATEGORIES },
      'PUT /api/me/personal/group-settings': async (init?: RequestInit) => {
        await held;
        const body = init?.body ? (JSON.parse(String(init.body)) as Partial<GroupSettingsView>) : {};
        settings = { ...settings, ...body };
        return Response.json({ settings });
      },
    });

    renderAt(<PersonalSettingsMenu />);
    await user.click(await screen.findByTestId('personal-settings-btn'));

    const sw = await screen.findByRole('switch', { name: 'Count loans in spending' });
    expect(sw).toHaveAttribute('aria-checked', 'false');

    await user.click(sw);

    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    expect(sw).toBeDisabled();

    release();

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        path: '/api/me/personal/group-settings',
        body: { countLoans: true },
      }),
    );
    await waitFor(() => expect(sw).not.toBeDisabled());
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('reverts count-loans switch and shows inline error when PUT fails', async () => {
    const user = userEvent.setup();
    const settings: GroupSettingsView = {
      defaultGroupCategoryId: 'cat-group',
      countLoans: false,
    };

    mockApi({
      'GET /api/me/personal/group-settings': { settings },
      'GET /api/me/personal/categories': { categories: CATEGORIES },
      'PUT /api/me/personal/group-settings': () =>
        Response.json(
          { error: { code: 'SERVER_ERROR', message: 'Internal error' } },
          { status: 500 },
        ),
    });

    renderAt(<PersonalSettingsMenu />);
    await user.click(await screen.findByTestId('personal-settings-btn'));

    const sw = await screen.findByRole('switch', { name: 'Count loans in spending' });
    await user.click(sw);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).not.toBeDisabled();
  });
});
