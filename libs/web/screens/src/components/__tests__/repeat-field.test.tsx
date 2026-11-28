import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLang } from '@cc/web-i18n';
import { RepeatField, type RepeatValue } from '../RepeatField';

beforeEach(() => {
  setLang('vi');
});

describe('RepeatField', () => {
  it('renders "Không lặp" when null and lists presets built from the entry date', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RepeatField date="2026-11-05" value={null} onChange={onChange} />);

    const trigger = screen.getByTestId('entry-repeat');
    expect(trigger).toHaveTextContent('Lặp lại');
    expect(trigger).toHaveTextContent('Không lặp');

    await user.click(trigger);

    expect(screen.getByTestId('repeat-option-none')).toHaveTextContent('Không lặp');
    expect(screen.getByTestId('repeat-option-day')).toHaveTextContent('Hàng ngày');
    expect(screen.getByTestId('repeat-option-week')).toHaveTextContent('Thứ Năm hàng tuần');
    expect(screen.getByTestId('repeat-option-month')).toHaveTextContent('Ngày 5 hàng tháng');
    expect(screen.getByTestId('repeat-option-year')).toHaveTextContent('Ngày 5/11 hàng năm');
    expect(screen.getByTestId('repeat-option-custom')).toHaveTextContent('Tùy chỉnh…');
    expect(screen.getByTestId('repeat-sheet-hint')).toHaveTextContent('Lần tới: 5/12.');

    await user.click(screen.getByTestId('repeat-option-month'));
    expect(onChange).toHaveBeenCalledWith({
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-11-05',
        end: { kind: 'never' },
      },
      askMe: false,
    });
  });

  it('uses "Ngày cuối hàng tháng" and monthDay "last" on a month last day', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RepeatField date="2026-11-30" value={null} onChange={onChange} />);
    await user.click(screen.getByTestId('entry-repeat'));

    expect(screen.getByTestId('repeat-option-month')).toHaveTextContent('Ngày cuối hàng tháng');
    await user.click(screen.getByTestId('repeat-option-month'));

    expect(onChange).toHaveBeenCalledWith({
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 'last',
        startDate: '2026-11-30',
        end: { kind: 'never' },
      },
      askMe: false,
    });
  });

  it('supports custom weekly schedule with multiple weekdays (T2 + T4) and keeps at least one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    // 2026-11-02 is Monday (weekday 1)
    render(<RepeatField date="2026-11-02" value={null} onChange={onChange} />);
    await user.click(screen.getByTestId('entry-repeat'));
    await user.click(screen.getByTestId('repeat-option-custom'));

    await user.click(screen.getByTestId('repeat-unit-week'));
    // T2 is already selected by default; clicking it alone must not deselect it
    await user.click(screen.getByTestId('repeat-weekday-1'));
    expect(screen.getByTestId('repeat-weekday-1')).toHaveAttribute('aria-pressed', 'true');

    // Add T4 (weekday 3)
    await user.click(screen.getByTestId('repeat-weekday-3'));
    await user.click(screen.getByTestId('repeat-done'));

    expect(onChange).toHaveBeenCalledWith({
      schedule: {
        unit: 'week',
        every: 1,
        weekdays: [1, 3],
        startDate: '2026-11-02',
        end: { kind: 'never' },
      },
      askMe: false,
    });
  });

  it('supports custom end after N times, short-month note for day >= 29, and check-in note', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RepeatField date="2026-10-31" value={null} onChange={onChange} />);
    await user.click(screen.getByTestId('entry-repeat'));
    await user.click(screen.getByTestId('repeat-option-custom'));

    // Default monthDay on Oct 31 is 'last'; switch to 'Ngày 31' to see the short-month note
    await user.click(screen.getByTestId('repeat-monthday-date'));
    expect(screen.getByTestId('repeat-short-month-note')).toHaveTextContent(
      'Tháng không có ngày 31 sẽ ghi vào ngày cuối tháng.',
    );

    expect(screen.getByTestId('repeat-checkin-note')).toHaveTextContent(
      'Thỉnh thoảng CoinCrew sẽ hỏi bạn còn dùng khoản này không',
    );

    const countInput = screen.getByTestId('repeat-end-count');
    await user.clear(countInput);
    await user.type(countInput, '12');

    await user.click(screen.getByTestId('repeat-done'));

    expect(onChange).toHaveBeenCalledWith({
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 31,
        startDate: '2026-10-31',
        end: { kind: 'count', count: 12 },
      },
      askMe: false,
    });
  });

  it('locks askMe on and disabled for asset buys and hides "Không lặp" when allowNone is false', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initial: RepeatValue = {
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 10,
        startDate: '2026-11-10',
        end: { kind: 'never' },
      },
      askMe: true,
    };

    render(
      <RepeatField
        date="2026-11-10"
        value={initial}
        onChange={onChange}
        isBuy
        allowNone={false}
      />,
    );

    expect(screen.getByTestId('entry-repeat')).toHaveTextContent('Ngày 10 mỗi tháng');
    await user.click(screen.getByTestId('entry-repeat'));

    expect(screen.queryByTestId('repeat-option-none')).toBeNull();

    await user.click(screen.getByTestId('repeat-option-custom'));
    const askSwitch = screen.getByTestId('repeat-askme');
    expect(askSwitch).toBeDisabled();
    expect(askSwitch).toHaveAttribute('data-state', 'checked');
    expect(
      screen.getByText('Mua tài sản luôn chờ bạn nhập số lượng.'),
    ).toBeInTheDocument();
  });
});
