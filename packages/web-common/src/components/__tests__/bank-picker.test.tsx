import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankApp } from '@fsl/core';
import { renderAt } from '../../test/render';
import { setLang } from '../../i18n';
import { BankPickerSheet } from '../BankPickerSheet';

const apps: BankApp[] = [
  {
    appId: 'vcb',
    appName: 'VCB Digibank',
    bankName: 'Ngân hàng TMCP Ngoại Thương Việt Nam',
    bankShortName: 'Vietcombank',
    bankCode: 'VCB',
    monthlyInstall: 300000,
  },
  {
    appId: 'acb',
    appName: 'ACB ONE',
    bankName: 'Ngân hàng TMCP Á Châu',
    bankShortName: 'ACB',
    bankCode: 'ACB',
    monthlyInstall: 70000,
  },
  {
    appId: 'mb',
    appName: 'MB Bank',
    bankName: 'Ngân hàng TMCP Quân đội',
    bankShortName: 'MBBank',
    bankCode: 'MB',
    monthlyInstall: 500000,
  },
];

const acb = apps.find((a) => a.appId === 'acb')!;
const vcb = apps.find((a) => a.appId === 'vcb')!;

beforeEach(() => {
  setLang('en');
});

describe('BankPickerSheet', () => {
  it('lists recent first, then every app', () => {
    renderAt(
      <BankPickerSheet
        open
        onClose={() => {}}
        apps={apps}
        recent={acb}
        onPick={() => {}}
      />,
    );

    const rows = document.querySelectorAll('.fsl-bank-row');
    expect(rows.length).toBe(4);
    expect(rows[0]!.textContent).toContain('ACB ONE');

    const popularLabel = screen.getByText('Popular');
    expect(popularLabel).toBeInTheDocument();

    const popularRows = Array.from(rows).slice(1);
    expect(popularRows).toHaveLength(3);
    const popularTexts = popularRows.map((r) => r.textContent);
    expect(popularTexts.some((t) => t?.includes('ACB ONE'))).toBe(true);
    expect(popularTexts.some((t) => t?.includes('VCB Digibank'))).toBe(true);
    expect(popularTexts.some((t) => t?.includes('MB Bank'))).toBe(true);
  });

  it('typing filters without accents', async () => {
    renderAt(
      <BankPickerSheet
        open
        onClose={() => {}}
        apps={apps}
        recent={acb}
        onPick={() => {}}
      />,
    );

    const searchInput = screen.getByRole('searchbox');
    await userEvent.type(searchInput, 'á châu');

    const rows = document.querySelectorAll('.fsl-bank-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('ACB ONE');
  });

  it('no match shows the empty line', async () => {
    renderAt(
      <BankPickerSheet
        open
        onClose={() => {}}
        apps={apps}
        recent={acb}
        onPick={() => {}}
      />,
    );

    const searchInput = screen.getByRole('searchbox');
    await userEvent.type(searchInput, 'zzz');

    expect(screen.getByText('No bank matches "zzz"')).toBeInTheDocument();
    expect(document.querySelector('.fsl-bank-picker__empty')).toBeInTheDocument();
    expect(document.querySelectorAll('.fsl-bank-row')).toHaveLength(0);
  });

  it('picking a row calls onPick with that app', async () => {
    const onPick = vi.fn();
    renderAt(
      <BankPickerSheet
        open
        onClose={() => {}}
        apps={apps}
        recent={null}
        onPick={onPick}
      />,
    );

    const vcbRow = screen.getByText('VCB Digibank').closest('button')!;
    await userEvent.click(vcbRow);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(vcb);
  });

  it('the search field is 16px and labelled', () => {
    renderAt(
      <BankPickerSheet
        open
        onClose={() => {}}
        apps={apps}
        recent={null}
        onPick={() => {}}
      />,
    );

    const searchbox = screen.getByRole('searchbox', {
      name: 'Search: vcb, techcom, Á Châu…',
    });
    expect(searchbox).toBeInTheDocument();
    expect(searchbox).toHaveClass('text-base');
  });
});
