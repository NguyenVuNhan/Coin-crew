import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setLang } from '@cc/web-i18n';
import { WhenSheet } from '../WhenSheet';

const TODAY = '2026-11-19';

beforeEach(() => {
  setLang('vi', false);
});

describe('WhenSheet', () => {
  it('Tuần trước picks 2026-11-09..2026-11-15', () => {
    const onPickRange = vi.fn();
    const onClose = vi.fn();
    render(
      <WhenSheet
        open={true}
        onClose={onClose}
        month="2026-11"
        today={TODAY}
        onPickMonth={vi.fn()}
        onPickRange={onPickRange}
      />,
    );

    fireEvent.click(screen.getByTestId('tx-when-quick-lastWeek'));
    expect(onPickRange).toHaveBeenCalledWith({ from: '2026-11-09', to: '2026-11-15' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tháng trước picks month 2026-10', () => {
    const onPickMonth = vi.fn();
    const onClose = vi.fn();
    render(
      <WhenSheet
        open={true}
        onClose={onClose}
        month="2026-11"
        today={TODAY}
        onPickMonth={onPickMonth}
        onPickRange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('tx-when-quick-lastMonth'));
    expect(onPickMonth).toHaveBeenCalledWith('2026-10');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('month grid picks 2026-03 and disables 2026-12', () => {
    const onPickMonth = vi.fn();
    const onClose = vi.fn();
    render(
      <WhenSheet
        open={true}
        onClose={onClose}
        month="2026-11"
        today={TODAY}
        onPickMonth={onPickMonth}
        onPickRange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('tx-when-month-12')).toBeDisabled();
    fireEvent.click(screen.getByTestId('tx-when-month-03'));
    expect(onPickMonth).toHaveBeenCalledWith('2026-03');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the year stepper stops at 2026', () => {
    render(
      <WhenSheet
        open={true}
        onClose={vi.fn()}
        month="2026-11"
        today={TODAY}
        onPickMonth={vi.fn()}
        onPickRange={vi.fn()}
      />,
    );

    const nextYear = screen.getByTestId('tx-when-year-next');
    expect(nextYear).toBeDisabled();

    fireEvent.click(screen.getByTestId('tx-when-year-prev'));
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(nextYear).not.toBeDisabled();

    fireEvent.click(nextYear);
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(nextYear).toBeDisabled();
  });

  it("custom from after to shows the error and doesn't apply", () => {
    const onPickRange = vi.fn();
    const onClose = vi.fn();
    render(
      <WhenSheet
        open={true}
        onClose={onClose}
        month="2026-11"
        today={TODAY}
        onPickMonth={vi.fn()}
        onPickRange={onPickRange}
      />,
    );

    fireEvent.change(screen.getByTestId('tx-when-from'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByTestId('tx-when-to'), { target: { value: '2026-11-19' } });
    fireEvent.click(screen.getByTestId('tx-when-apply'));

    expect(screen.getByTestId('tx-when-error')).toHaveTextContent(
      'Ngày bắt đầu phải trước ngày kết thúc',
    );
    expect(onPickRange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('custom over 366 days shows the error only when rangeLimitDays is set', () => {
    const onPickRange = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <WhenSheet
        open={true}
        onClose={onClose}
        month="2026-11"
        today={TODAY}
        rangeLimitDays={366}
        onPickMonth={vi.fn()}
        onPickRange={onPickRange}
      />,
    );

    fireEvent.change(screen.getByTestId('tx-when-from'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByTestId('tx-when-to'), { target: { value: '2026-11-19' } });
    fireEvent.click(screen.getByTestId('tx-when-apply'));

    expect(screen.getByTestId('tx-when-error')).toHaveTextContent('Chọn tối đa 1 năm');
    expect(onPickRange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <WhenSheet
        open={true}
        onClose={onClose}
        month="2026-11"
        today={TODAY}
        rangeLimitDays={undefined}
        onPickMonth={vi.fn()}
        onPickRange={onPickRange}
      />,
    );

    fireEvent.click(screen.getByTestId('tx-when-apply'));
    expect(screen.queryByTestId('tx-when-error')).toBeNull();
    expect(onPickRange).toHaveBeenCalledWith({ from: '2025-01-01', to: '2026-11-19' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('same day in both applies a single day', () => {
    const onPickRange = vi.fn();
    const onClose = vi.fn();
    render(
      <WhenSheet
        open={true}
        onClose={onClose}
        month="2026-11"
        today={TODAY}
        onPickMonth={vi.fn()}
        onPickRange={onPickRange}
      />,
    );

    fireEvent.change(screen.getByTestId('tx-when-from'), { target: { value: '2026-11-19' } });
    fireEvent.change(screen.getByTestId('tx-when-to'), { target: { value: '2026-11-19' } });
    fireEvent.click(screen.getByTestId('tx-when-apply'));

    expect(screen.queryByTestId('tx-when-error')).toBeNull();
    expect(onPickRange).toHaveBeenCalledWith({ from: '2026-11-19', to: '2026-11-19' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
