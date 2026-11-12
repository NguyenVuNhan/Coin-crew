import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { HistoryLine } from '@cc/core';
import { renderAt } from '../../test/render';
import { HistoryList } from '../HistoryList';

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

const plus = line({ id: 'e-plus' });
const minus = line({
  id: 'e-minus',
  title: 'Taxi',
  paidBy: 'other',
  amount: 100000,
  ownerShare: 50000,
  otherShare: 50000,
  effect: -50000,
});

describe('HistoryList', () => {
  it('renders lines newest-first with +120.000₫ in text-success and −50.000₫ in text-danger', () => {
    const { container } = renderAt(<HistoryList lines={[plus, minus]} otherName="An" />);
    const rows = container.querySelectorAll('.fsl-history__line');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe(screen.getByTestId('history-line-e-plus'));
    expect(rows[1]).toBe(screen.getByTestId('history-line-e-minus'));
    const up = within(rows[0] as HTMLElement).getByText(/120\.000/, { selector: '.fsl-amount' });
    expect(up.className).toContain('text-success');
    const down = within(rows[1] as HTMLElement).getByText(/50\.000/, { selector: '.fsl-amount' });
    expect(down.className).toContain('text-danger');
    expect(within(rows[0] as HTMLElement).getByText('Lunch')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText(/You 120\.000₫ · An 120\.000₫/)).toBeInTheDocument();
  });

  it('titles a payment by who paid', () => {
    renderAt(
      <HistoryList
        lines={[
          line({ id: 'p1', kind: 'payment', title: null, paidBy: 'owner', effect: 90000, ownerShare: 0, otherShare: 0 }),
          line({ id: 'p2', kind: 'payment', title: null, paidBy: 'other', effect: -90000, ownerShare: 0, otherShare: 0 }),
        ]}
        otherName="An"
      />,
    );
    expect(within(screen.getByTestId('history-line-p1')).getByText('You paid An')).toBeInTheDocument();
    expect(within(screen.getByTestId('history-line-p2')).getByText('An paid you')).toBeInTheDocument();
  });

  it('waiting line shows the Waiting pill', () => {
    renderAt(<HistoryList lines={[line({ id: 'w', state: 'waiting' })]} otherName="An" />);
    expect(within(screen.getByTestId('history-line-w')).getByText('Waiting')).toBeInTheDocument();
  });

  it('unapproved line shows the approval pill', () => {
    renderAt(<HistoryList lines={[line({ id: 'u', state: 'unapproved' })]} otherName="An" />);
    expect(within(screen.getByTestId('history-line-u')).getByText('Waiting for approval')).toBeInTheDocument();
  });

  it('unapproved line has no money colour (it is not counted)', () => {
    renderAt(<HistoryList lines={[line({ id: 'u2', state: 'unapproved' })]} otherName="An" />);
    const amount = within(screen.getByTestId('history-line-u2')).getByText(/120\.000/, { selector: '.fsl-amount' });
    expect(amount.className).not.toContain('text-success');
    expect(amount.className).not.toContain('text-danger');
  });

  it('disabled line is line-through', () => {
    renderAt(<HistoryList lines={[line({ id: 'd', state: 'disabled' })]} otherName="An" />);
    const row = screen.getByTestId('history-line-d');
    expect(within(row).getByText('Lunch').className).toContain('line-through');
    const amount = within(row).getByText(/120\.000/, { selector: '.fsl-amount' });
    expect(amount.className).not.toContain('text-success');
    expect(amount.className).not.toContain('text-danger');
  });

  it('reroute gap shows "Between you two" and "To save transfers, the group changed this to 210.000₫."', () => {
    const { container } = renderAt(
      <HistoryList
        lines={[plus]}
        otherName="An"
        summary={{ twoWay: 120000, suggested: 210000, gap: { kind: 'reroute', difference: 90000, viaPid: null } }}
      />,
    );
    const gap = container.querySelector('.fsl-history__gap') as HTMLElement;
    expect(within(gap).getByText('Between you two')).toBeInTheDocument();
    expect(within(gap).getByText('To save transfers, the group changed this to 210.000₫.')).toBeInTheDocument();
  });

  it('reroute with viaName shows "90.000₫ moved to Minh to save transfers."', () => {
    renderAt(
      <HistoryList
        lines={[plus]}
        otherName="An"
        summary={{
          twoWay: 120000,
          suggested: 210000,
          gap: { kind: 'reroute', difference: 90000, viaPid: 'p-m' },
          viaName: 'Minh',
        }}
      />,
    );
    expect(screen.getByText('90.000₫ moved to Minh to save transfers.')).toBeInTheDocument();
  });

  it('rounding gap shows "Rounded to 1.000₫"', () => {
    renderAt(
      <HistoryList lines={[plus]} otherName="An" summary={{ twoWay: 120400, suggested: 120000, gap: { kind: 'rounding' } }} />,
    );
    expect(screen.getByText('Rounded to 1.000₫')).toBeInTheDocument();
  });

  it('renders no summary block without a gap', () => {
    const { container } = renderAt(
      <HistoryList lines={[plus]} otherName="An" summary={{ twoWay: 120000, suggested: 120000, gap: null }} />,
    );
    expect(container.querySelector('.fsl-history__gap')).toBeNull();
  });

  it('perspective other flips colour', () => {
    renderAt(<HistoryList lines={[plus, minus]} otherName="An" perspective="other" />);
    const up = within(screen.getByTestId('history-line-e-plus')).getByText(/120\.000/, { selector: '.fsl-amount' });
    expect(up.className).toContain('text-danger');
    const down = within(screen.getByTestId('history-line-e-minus')).getByText(/50\.000/, { selector: '.fsl-amount' });
    expect(down.className).toContain('text-success');
  });

  it('perspective other swaps you/name wording on payments', () => {
    renderAt(
      <HistoryList
        lines={[line({ id: 'p1', kind: 'payment', title: null, paidBy: 'owner', effect: 90000, ownerShare: 0, otherShare: 0 })]}
        otherName="An"
        perspective="other"
      />,
    );
    expect(within(screen.getByTestId('history-line-p1')).getByText('An paid you')).toBeInTheDocument();
  });

  it('compact hides the shares line', () => {
    renderAt(<HistoryList lines={[plus]} otherName="An" compact />);
    const row = screen.getByTestId('history-line-e-plus');
    expect(within(row).getByText('Lunch')).toBeInTheDocument();
    expect(within(row).getByText(/2026/)).toBeInTheDocument();
    expect(within(row).queryByText(/You 120\.000₫/)).toBeNull();
    expect(within(row).queryByText(/paid/)).toBeNull();
  });

  it('tags lines from their ledger', () => {
    renderAt(<HistoryList lines={[plus]} otherName="An" theirsTripIds={new Set(['t-1'])} />);
    expect(within(screen.getByTestId('history-line-e-plus')).getByText("In An's expenses")).toBeInTheDocument();
  });
});
