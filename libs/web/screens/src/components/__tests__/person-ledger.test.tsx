import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { HistoryLine, HistoryPlace } from '@cc/core';
import { renderAt } from '../../test/render';
import { PersonLedger, toLedgerPlaces, type LedgerPlace } from '../PersonLedger';

const line = (l: Partial<HistoryLine> & Pick<HistoryLine, 'id'>): HistoryLine => ({
  kind: 'expense',
  tripId: 't-1',
  title: 'Lunch',
  date: '2026-10-12',
  createdAt: '2026-10-12T08:00:00.000Z',
  amount: 240000,
  paidBy: 'owner',
  ownerShare: 120000,
  otherShare: 120000,
  effect: 120000,
  state: 'counted',
  ...l,
});

const place = (p: Partial<HistoryPlace> & Pick<HistoryPlace, 'tripId'>): HistoryPlace => ({
  tripName: 'Quick expenses',
  kind: 'direct',
  source: 'own',
  amount: 0,
  history: null,
  ...p,
});

const pairHistory = (lines: HistoryLine[], extra: Partial<NonNullable<HistoryPlace['history']>> = {}) => ({
  lines,
  twoWay: lines.reduce((s, l) => s + l.effect, 0),
  suggested: lines.reduce((s, l) => s + l.effect, 0),
  gap: null,
  trimmed: false,
  ...extra,
});

const places: HistoryPlace[] = [
  place({
    tripId: 'd-own',
    source: 'own',
    amount: 100000,
    history: pairHistory([line({ id: 'a', tripId: 'd-own', title: 'Own', createdAt: '2026-10-01T00:00:00.000Z', effect: 100000 })]),
  }),
  place({
    tripId: 'g-1',
    tripName: 'Đà Lạt',
    kind: 'group',
    source: 'group',
    amount: -30000,
    history: pairHistory(
      [line({ id: 'g', tripId: 'g-1', title: 'Hotel', effect: -50000, paidBy: 'other' })],
      { twoWay: -50000, suggested: -30000, gap: { kind: 'reroute', difference: 20000, viaPid: null } },
    ),
  }),
  place({
    tripId: 'd-merged',
    source: 'merged',
    amount: 20000,
    history: pairHistory([line({ id: 'b', tripId: 'd-merged', title: 'Merged', createdAt: '2026-10-03T00:00:00.000Z', effect: 20000 })]),
  }),
  place({
    tripId: 'd-theirs',
    source: 'theirs',
    amount: -5000,
    history: pairHistory([line({ id: 'c', tripId: 'd-theirs', title: 'Theirs', createdAt: '2026-10-02T00:00:00.000Z', effect: -5000, paidBy: 'other' })]),
  }),
];

const ledger = () => toLedgerPlaces(places, { quickExpenses: 'Quick expenses' });

describe('PersonLedger', () => {
  it('toLedgerPlaces merges three direct places into one row with the summed amount and all lines newest first, tagging theirs', () => {
    const rows = ledger();
    expect(rows.map((r) => r.id)).toEqual(['direct', 'g-1']);
    const direct = rows[0]!;
    expect(direct.kind).toBe('direct');
    expect(direct.label).toBe('Quick expenses');
    expect(direct.amount).toBe(115000);
    expect(direct.lines.map((l) => l.id)).toEqual(['b', 'c', 'a']);
    expect([...(direct.theirsTripIds ?? [])]).toEqual(['d-theirs']);
    expect(direct.summary).toBeNull();
    const group = rows[1]!;
    expect(group.label).toBe('Đà Lạt');
    expect(group.amount).toBe(-30000);
    expect(group.summary).toEqual({ twoWay: -50000, suggested: -30000, gap: { kind: 'reroute', difference: 20000, viaPid: null } });

    renderAt(<PersonLedger places={rows} otherName="An" open="sheet" />);
    const row = screen.getByTestId('ledger-row-direct');
    expect(row.className).toContain('fsl-ledger__row');
    expect(within(row).getByText('Quick expenses')).toBeInTheDocument();
    expect(within(row).getByText(/115\.000/, { selector: '.fsl-amount' }).className).toContain('text-success');
    expect(within(screen.getByTestId('ledger-row-g-1')).getByText(/30\.000/, { selector: '.fsl-amount' }).className).toContain(
      'text-danger',
    );
  });

  it('total row equals the sum', () => {
    const { container } = renderAt(<PersonLedger places={ledger()} otherName="An" open="sheet" />);
    const total = container.querySelector('.fsl-ledger__total') as HTMLElement;
    expect(total).not.toBeNull();
    expect(total.tagName).not.toBe('BUTTON');
    expect(within(total).getByText('Total')).toBeInTheDocument();
    expect(within(total).getByText(/85\.000/, { selector: '.fsl-amount' })).toBeInTheDocument();
    expect(container.querySelector('.fsl-ledger')?.lastElementChild).toBe(total);
  });

  it('sheet mode: tapping a row opens a dialog titled with the label and shows its lines and Between you two', async () => {
    function Host() {
      const [openId, setOpenId] = useState<string | null>(null);
      return <PersonLedger places={ledger()} otherName="An" open="sheet" openId={openId} onOpenChange={setOpenId} />;
    }
    renderAt(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByTestId('ledger-row-g-1'));
    const sheet = screen.getByRole('dialog', { name: 'Đà Lạt' });
    expect(within(sheet).getByTestId('history-line-g')).toBeInTheDocument();
    expect(within(sheet).getByText('Between you two')).toBeInTheDocument();
  });

  it('sheet mode: group sheet has Open <group> link to groupHref', async () => {
    const rows: LedgerPlace[] = ledger().map((p) => (p.kind === 'group' ? { ...p, groupHref: `/t/${p.id}` } : p));
    const { rerender } = renderAt(<PersonLedger places={rows} otherName="An" open="sheet" openId="g-1" />);
    const sheet = screen.getByRole('dialog', { name: 'Đà Lạt' });
    const link = within(sheet).getByTestId('ledger-open-group');
    expect(link).toHaveAttribute('href', '/t/g-1');
    expect(link).toHaveTextContent('Open Đà Lạt');
    rerender(<div />);
    renderAt(<PersonLedger places={rows} otherName="An" open="sheet" openId="direct" />);
    const direct = screen.getByRole('dialog', { name: 'Quick expenses' });
    expect(within(direct).queryByTestId('ledger-open-group')).toBeNull();
    expect(within(direct).getByText("In An's expenses")).toBeInTheDocument();
  });

  it('inline mode: tapping toggles the compact list', async () => {
    renderAt(<PersonLedger places={ledger()} otherName="An" open="inline" />);
    const row = screen.getByTestId('ledger-row-g-1');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('history-line-g')).toBeNull();
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('history-line-g')).toBeInTheDocument();
    expect(screen.getByText('Between you two')).toBeInTheDocument();
    // compact: no "paid by" meta
    expect(screen.queryByText(/paid 240\.000/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('history-line-g')).toBeNull();
  });

  it('perspective other flips the row colour', () => {
    renderAt(<PersonLedger places={ledger()} otherName="Minh" open="inline" perspective="other" />);
    expect(
      within(screen.getByTestId('ledger-row-direct')).getByText(/115\.000/, { selector: '.fsl-amount' }).className,
    ).toContain('text-danger');
    expect(within(screen.getByTestId('ledger-row-g-1')).getByText(/30\.000/, { selector: '.fsl-amount' }).className).toContain(
      'text-success',
    );
  });

  it('rowTestId overrides the row test id', () => {
    renderAt(<PersonLedger places={ledger()} otherName="An" open="sheet" rowTestId={(p) => `place-${p.id}`} />);
    expect(screen.getByTestId('place-g-1')).toBeInTheDocument();
    expect(screen.queryByTestId('ledger-row-g-1')).toBeNull();
  });
});
