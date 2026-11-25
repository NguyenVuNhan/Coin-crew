import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetView } from '@cc/core';
import { setLang, t } from '@cc/web-i18n';
import { mockApi, renderAt } from '../../test/render';
import { AssetForm } from '../AssetForm';
import { AssetIconPickerSheet } from '../AssetIconPickerSheet';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssetIconPickerSheet', () => {
  it('opens on the tab that holds value, searches across tabs, selects an svg icon, and clears with letters tile', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const first = renderAt(
      <AssetIconPickerSheet
        open
        onClose={onClose}
        value="gold:gold-ring"
        onSelect={onSelect}
        asset={{ id: 'a1', name: 'Nhẫn vàng' }}
      />,
    );
    act(() => setLang('vi'));

    const goldTab = screen.getByTestId('asset-icon-tab-gold');
    expect(goldTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('asset-icon-option-gold:gold-ring')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const lettersTile = screen.getByTestId('asset-icon-option-letters');
    expect(lettersTile).toHaveTextContent(t('assets.iconLetters'));
    expect(within(lettersTile).getByTestId('asset-icon')).toHaveTextContent('NV');

    await user.click(lettersTile);
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();

    first.unmount();

    const onSelectBtc = vi.fn();
    const onCloseBtc = vi.fn();
    renderAt(
      <AssetIconPickerSheet
        open
        onClose={onCloseBtc}
        value="gold:gold-ring"
        onSelect={onSelectBtc}
        asset={{ id: 'a2', name: 'Bitcoin' }}
      />,
    );
    act(() => setLang('vi'));

    const search = screen.getByTestId('asset-icon-search');
    await user.type(search, 'btc');
    expect(screen.queryByTestId('asset-icon-tabs')).not.toBeInTheDocument();

    const btcOption = screen.getByTestId('asset-icon-option-crypto:btc');
    expect(btcOption).toBeInTheDocument();
    await user.click(btcOption);
    expect(onSelectBtc).toHaveBeenCalledWith('crypto:btc');
    expect(onCloseBtc).toHaveBeenCalled();
  });
});

describe('AssetForm icon picker and unit help copy', () => {
  it('shows icon row, sends selected icon on create, clears icon on edit, and displays updated unitHelp', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'POST /api/me/personal/assets': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          name: string;
          unit: string;
          groupName: string;
          decimals: number;
          icon?: string | null;
        };
        return Response.json(
          {
            asset: {
              id: 'a-new',
              ...body,
              icon: body.icon ?? null,
              hidden: false,
              sortOrder: 0,
              entryCount: 0,
            },
          },
          { status: 201 },
        );
      },
      'PATCH /api/me/personal/assets/a-btc': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Partial<AssetView>;
        return Response.json({
          asset: {
            id: 'a-btc',
            name: 'BTC',
            unit: '',
            groupName: 'Crypto',
            decimals: 4,
            icon: null,
            hidden: false,
            sortOrder: 0,
            entryCount: 0,
            ...body,
          },
        });
      },
    });

    const onSavedCreate = vi.fn();
    const first = renderAt(<AssetForm groups={[]} onSaved={onSavedCreate} onCancel={() => {}} />);
    act(() => setLang('vi'));

    expect(screen.getByText(t('assets.unitHelp'))).toBeInTheDocument();

    const iconRow = screen.getByTestId('asset-icon-row');
    expect(within(iconRow).getByTestId('asset-icon')).toBeInTheDocument();

    await user.type(screen.getByTestId('asset-name-input'), 'BTC');
    await user.type(screen.getByTestId('asset-unit-input'), '0,0001');

    await user.click(screen.getByRole('button', { name: t('assets.iconPick') }));
    await user.click(await screen.findByTestId('asset-icon-option-crypto:btc'));

    await user.click(screen.getByTestId('asset-save-btn'));
    await waitFor(() => expect(onSavedCreate).toHaveBeenCalledTimes(1));

    const postCall = calls.find((c) => c.method === 'POST' && c.path === '/api/me/personal/assets');
    expect(postCall?.body).toMatchObject({
      name: 'BTC',
      icon: 'crypto:btc',
    });

    first.unmount();

    const existingAsset: AssetView = {
      id: 'a-btc',
      name: 'BTC',
      unit: '',
      groupName: 'Crypto',
      decimals: 4,
      icon: 'crypto:btc',
      hidden: false,
      sortOrder: 0,
      entryCount: 0,
    };
    const onSavedEdit = vi.fn();
    renderAt(
      <AssetForm asset={existingAsset} groups={[]} onSaved={onSavedEdit} onCancel={() => {}} />,
    );
    act(() => setLang('vi'));

    await user.click(screen.getByRole('button', { name: t('assets.iconPick') }));
    await user.click(await screen.findByTestId('asset-icon-option-letters'));

    await user.click(screen.getByTestId('asset-save-btn'));
    await waitFor(() => expect(onSavedEdit).toHaveBeenCalledTimes(1));

    const patchCall = calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/me/personal/assets/a-btc',
    );
    expect(patchCall?.body).toMatchObject({
      name: 'BTC',
      icon: null,
    });
  });
});
