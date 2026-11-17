import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setLang } from '@cc/web-i18n';
import { EntryDateRow } from '../EntryDateRow';

// Tuesday 17 Nov 2026, 08:20 local.
const NOW = new Date(2026, 10, 17, 8, 20);

function setup(date: string, time: string | null, lang: 'vi' | 'en' = 'vi', showTime = true) {
  setLang(lang, false);
  const onChange = vi.fn();
  render(<EntryDateRow date={date} time={time} onChange={onChange} showTime={showTime} now={NOW} />);
  return onChange;
}

beforeEach(() => setLang('vi', false));

describe('EntryDateRow formatting', () => {
  it('reads Hôm nay with 24h time in Vietnamese', () => {
    setup('2026-11-17', '08:20');
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Hôm nay · 08:20');
  });

  it('reads Hôm qua', () => {
    setup('2026-11-16', '20:05');
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Hôm qua · 20:05');
  });

  it('reads weekday + d/M for other days, no year in the current year', () => {
    setup('2026-11-09', '08:20');
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Thứ Hai, 9/11 · 08:20');
  });

  it('adds the year only when it is not the current year', () => {
    setup('2025-11-16', '08:20');
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Chủ Nhật, 16/11/2025 · 08:20');
  });

  it('reads English today', () => {
    setup('2026-11-17', '08:20', 'en');
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Today · 08:20');
  });

  it('reads English yesterday', () => {
    setup('2026-11-16', '08:20', 'en');
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Yesterday · 08:20');
  });

  it('reads English weekday day month', () => {
    setup('2026-11-09', '08:20', 'en');
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Mon 9 Nov · 08:20');
  });

  it('English adds the year in another year', () => {
    setup('2025-11-16', '08:20', 'en');
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Sun 16 Nov 2025 · 08:20');
  });

  it('has no time part when showTime is false', () => {
    setup('2026-11-17', '08:20', 'vi', false);
    expect(screen.getByTestId('entry-date-row')).not.toHaveTextContent('08:20');
    expect(screen.queryByRole('button', { name: 'Đổi giờ' })).toBeNull();
    expect(screen.queryByTestId('entry-time-picker')).toBeNull();
  });

  it('has no time part when time is null', () => {
    setup('2026-11-17', null);
    expect(screen.getByTestId('entry-date-row')).not.toHaveTextContent('·');
  });
});

describe('EntryDateRow behaviour', () => {
  it('Hôm qua chip sets yesterday and keeps the time', () => {
    const onChange = setup('2026-11-17', '08:20');
    fireEvent.click(screen.getByRole('button', { name: 'Hôm qua' }));
    expect(onChange).toHaveBeenCalledWith({ date: '2026-11-16', time: '08:20' });
  });

  it('chip flips to Hôm nay when the date is yesterday', () => {
    const onChange = setup('2026-11-16', '08:20');
    expect(screen.queryByRole('button', { name: 'Hôm qua' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(onChange).toHaveBeenCalledWith({ date: '2026-11-17', time: '08:20' });
  });

  it('changing the date picker keeps the time', () => {
    const onChange = setup('2026-11-17', '08:20');
    fireEvent.change(screen.getByTestId('entry-date-picker'), { target: { value: '2026-11-01' } });
    expect(onChange).toHaveBeenCalledWith({ date: '2026-11-01', time: '08:20' });
  });

  it('changing the time keeps the date', () => {
    const onChange = setup('2026-11-12', '08:20');
    fireEvent.change(screen.getByTestId('entry-time-picker'), { target: { value: '14:45' } });
    expect(onChange).toHaveBeenCalledWith({ date: '2026-11-12', time: '14:45' });
  });

  it('Chọn ngày and Đổi giờ open the hidden pickers (focus + click fallback)', () => {
    setup('2026-11-17', '08:20');
    const dateInput = screen.getByTestId('entry-date-picker') as HTMLInputElement;
    const timeInput = screen.getByTestId('entry-time-picker') as HTMLInputElement;
    const dateClick = vi.spyOn(dateInput, 'click');
    const timeClick = vi.spyOn(timeInput, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Chọn ngày' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đổi giờ' }));
    expect(dateClick).toHaveBeenCalled();
    expect(timeClick).toHaveBeenCalled();
  });

  it('exposes accessible names and hides the native inputs', () => {
    setup('2026-11-17', '08:20');
    expect(screen.getByRole('button', { name: 'Ngày: Hôm nay, 08:20' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hôm qua' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chọn ngày' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đổi giờ' })).toBeInTheDocument();
    for (const id of ['entry-date-picker', 'entry-time-picker']) {
      const el = screen.getByTestId(id);
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el).toHaveAttribute('tabindex', '-1');
    }
  });
});

describe('EntryDateRow tap-through pickers (iOS Safari only opens a picker from a real tapped input)', () => {
  it('lays a transparent native input over the date value, the time and Chọn ngày', () => {
    setup('2026-11-17', '08:20');
    const ids = ['entry-date-overlay-value', 'entry-time-overlay-value', 'entry-date-overlay-chip'];
    for (const id of ids) {
      const el = screen.getByTestId(id);
      expect(el.tagName).toBe('INPUT');
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el).toHaveAttribute('tabindex', '-1');
      expect(el.className).toContain('absolute');
      expect(el.className).toContain('inset-0');
      expect(el.className).toContain('opacity-0');
      expect(el.className).not.toContain('sr-only');
    }
    expect(screen.getByTestId('entry-date-overlay-value')).toHaveAttribute('type', 'date');
    expect(screen.getByTestId('entry-time-overlay-value')).toHaveAttribute('type', 'time');
  });

  it('a value picked on an overlay reaches onChange', () => {
    const onChange = setup('2026-11-17', '08:20');
    fireEvent.change(screen.getByTestId('entry-date-overlay-chip'), { target: { value: '2026-11-03' } });
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-03', time: '08:20' });
    fireEvent.change(screen.getByTestId('entry-date-overlay-value'), { target: { value: '2026-11-04' } });
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-04', time: '08:20' });
    fireEvent.change(screen.getByTestId('entry-time-overlay-value'), { target: { value: '21:05' } });
    expect(onChange).toHaveBeenLastCalledWith({ date: '2026-11-17', time: '21:05' });
  });

  it('has no time overlay when time is hidden', () => {
    setup('2026-11-17', '08:20', 'vi', false);
    expect(screen.queryByTestId('entry-time-overlay-value')).toBeNull();
  });
});
