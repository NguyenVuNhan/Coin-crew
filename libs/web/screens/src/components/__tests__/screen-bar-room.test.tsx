import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderAt } from '../../test/render';
import { Screen } from '../Screen';

// Owner, 2026-11-12: the sticky "I've paid" bar (button + hint, more with an error) covered the page's last lines,
// because the page only kept a fixed 72px for it. The page now keeps the bar's measured height.
type Observed = { cb: ResizeObserverCallback; el: Element | null };
const observers: Observed[] = [];

class FakeResizeObserver {
  private o: Observed;
  constructor(cb: ResizeObserverCallback) {
    this.o = { cb, el: null };
    observers.push(this.o);
  }
  observe(el: Element) {
    this.o.el = el;
  }
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe('a screen with a bottom bar', () => {
  it('keeps room under the content for the bar as tall as it really is', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    renderAt(
      <Screen title="Pay" bottomBar={<button type="button">I've paid</button>}>
        <p>Last line</p>
      </Screen>,
    );
    const bar = document.querySelector('.fsl-bottom-bar')!;
    const watcher = observers.find((o) => o.el === bar)!;
    expect(watcher).toBeDefined();
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 131 } as DOMRect);
    act(() => watcher.cb([], watcher as never));
    const main = document.querySelector<HTMLElement>('.fsl-screen__content')!;
    expect(main.style.getPropertyValue('--bar-h')).toBe('131px');
    expect(main.className).toContain('var(--bar-h');
  });
});
