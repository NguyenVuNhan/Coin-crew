import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setLang } from '@cc/web-i18n';
import { BackToTop } from '../BackToTop';

function scrollPageTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  fireEvent.scroll(window);
}

beforeEach(() => {
  setLang('vi', false);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  scrollPageTo(0);
});

describe('BackToTop', () => {
  it('stays hidden near the top and shows after scrolling far down', () => {
    render(<BackToTop />);
    const button = screen.getByTestId('tx-back-to-top');
    expect(button).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveAttribute('tabindex', '-1');

    scrollPageTo(2000);
    expect(button).toHaveAttribute('aria-hidden', 'false');
    expect(button).toHaveAttribute('tabindex', '0');
    expect(button).toHaveAccessibleName('Lên đầu trang');
  });

  it('scrolls the page back to the top', () => {
    render(<BackToTop />);
    scrollPageTo(2000);
    fireEvent.click(screen.getByTestId('tx-back-to-top'));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
