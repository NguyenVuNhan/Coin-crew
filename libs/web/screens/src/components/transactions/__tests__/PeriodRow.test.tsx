import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setLang } from '@cc/web-i18n';
import { PeriodRow } from '../PeriodRow';

const TODAY = '2026-11-19';

beforeEach(() => {
  setLang('vi', false);
});

describe('PeriodRow', () => {
  it('no range shows arrows and the month button', () => {
    const onShiftMonth = vi.fn();
    const onOpenWhen = vi.fn();
    render(
      <PeriodRow
        month="2026-11"
        isSearching={false}
        today={TODAY}
        onShiftMonth={onShiftMonth}
        onOpenWhen={onOpenWhen}
        onClearRange={vi.fn()}
        right={<span data-testid="tx-view-toggle">Theo ngày</span>}
      />,
    );

    const prev = screen.getByTestId('month-prev');
    const next = screen.getByTestId('month-next');
    const label = screen.getByTestId('tx-month-label');
    expect(label).toHaveTextContent('Tháng 11, 2026');
    expect(screen.queryByTestId('tx-range-button')).toBeNull();
    expect(screen.queryByTestId('tx-range-clear')).toBeNull();
    expect(screen.getByTestId('tx-view-toggle')).toBeInTheDocument();

    fireEvent.click(prev);
    expect(onShiftMonth).toHaveBeenCalledWith(-1);
    fireEvent.click(next);
    expect(onShiftMonth).toHaveBeenCalledWith(1);
    fireEvent.click(label);
    expect(onOpenWhen).toHaveBeenCalledTimes(1);
  });

  it('a range hides the arrows and shows "Tuần trước" for 09–15/11', () => {
    const onOpenWhen = vi.fn();
    render(
      <PeriodRow
        month="2026-11"
        from="2026-11-09"
        to="2026-11-15"
        isSearching={false}
        today={TODAY}
        onShiftMonth={vi.fn()}
        onOpenWhen={onOpenWhen}
        onClearRange={vi.fn()}
        right={<span data-testid="tx-view-toggle" />}
      />,
    );

    expect(screen.queryByTestId('month-prev')).toBeNull();
    expect(screen.queryByTestId('month-next')).toBeNull();
    expect(screen.queryByTestId('tx-month-label')).toBeNull();

    const rangeBtn = screen.getByTestId('tx-range-button');
    expect(rangeBtn).toHaveTextContent('Tuần trước');
    fireEvent.click(rangeBtn);
    expect(onOpenWhen).toHaveBeenCalledTimes(1);
  });

  it('a custom range shows the dates and × clears it', () => {
    const onClearRange = vi.fn();
    render(
      <PeriodRow
        month="2026-11"
        from="2026-11-01"
        to="2026-11-10"
        isSearching={false}
        today={TODAY}
        onShiftMonth={vi.fn()}
        onOpenWhen={vi.fn()}
        onClearRange={onClearRange}
        right={<span data-testid="tx-view-toggle" />}
      />,
    );

    expect(screen.getByTestId('tx-range-button')).toHaveTextContent('01/11 – 10/11/2026');
    fireEvent.click(screen.getByTestId('tx-range-clear'));
    expect(onClearRange).toHaveBeenCalledTimes(1);
  });

  it('searching shows "Mọi lúc" and no arrows', () => {
    const onOpenWhen = vi.fn();
    render(
      <PeriodRow
        month="2026-11"
        isSearching={true}
        today={TODAY}
        onShiftMonth={vi.fn()}
        onOpenWhen={onOpenWhen}
        onClearRange={vi.fn()}
        right={<span data-testid="tx-view-toggle" />}
      />,
    );

    expect(screen.queryByTestId('month-prev')).toBeNull();
    expect(screen.queryByTestId('month-next')).toBeNull();
    expect(screen.queryByTestId('tx-range-clear')).toBeNull();

    const rangeBtn = screen.getByTestId('tx-range-button');
    expect(rangeBtn).toHaveTextContent('Mọi lúc');
    fireEvent.click(rangeBtn);
    expect(onOpenWhen).toHaveBeenCalledTimes(1);
  });

  it('searching with a range shows the range', () => {
    render(
      <PeriodRow
        month="2026-11"
        from="2026-11-12"
        to="2026-11-19"
        isSearching={true}
        today={TODAY}
        onShiftMonth={vi.fn()}
        onOpenWhen={vi.fn()}
        onClearRange={vi.fn()}
        right={<span data-testid="tx-view-toggle" />}
      />,
    );

    expect(screen.queryByTestId('month-prev')).toBeNull();
    expect(screen.getByTestId('tx-range-button')).toHaveTextContent('12/11 – 19/11/2026');
    expect(screen.getByTestId('tx-range-clear')).toBeInTheDocument();
  });
});
