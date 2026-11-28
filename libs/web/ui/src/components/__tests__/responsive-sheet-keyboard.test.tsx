import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSheet } from '../ui/responsive-sheet';

function setNarrow() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** A fake visualViewport whose height the test controls. */
function stubVisualViewport() {
  const target = new EventTarget();
  let height = window.innerHeight;
  Object.defineProperty(target, 'height', { get: () => height });
  Object.defineProperty(target, 'offsetTop', { get: () => 0 });
  vi.stubGlobal('visualViewport', target);
  return {
    setHeight(next: number) {
      height = next;
      act(() => {
        target.dispatchEvent(new Event('resize'));
      });
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('ResponsiveSheet and the on-screen keyboard', () => {
  it('sits flush on the keyboard while it is open', async () => {
    setNarrow();
    const vv = stubVisualViewport();
    render(
      <ResponsiveSheet open onOpenChange={() => {}} title="Sự kiện mới">
        <input aria-label="Tên" />
      </ResponsiveSheet>,
    );
    const drawer = await screen.findByRole('dialog', { name: 'Sự kiện mới' });
    expect(drawer).not.toHaveAttribute('data-keyboard-open');
    vv.setHeight(window.innerHeight - 336);
    expect(drawer).toHaveAttribute('data-keyboard-open');
    expect(drawer.className).toContain('before:bottom-0');
  });

  it('drops the fixed height vaul leaves behind once the keyboard closes', async () => {
    setNarrow();
    const vv = stubVisualViewport();
    render(
      <ResponsiveSheet open onOpenChange={() => {}} title="Sự kiện mới">
        <input aria-label="Tên" />
      </ResponsiveSheet>,
    );
    const drawer = await screen.findByRole('dialog', { name: 'Sự kiện mới' });
    vv.setHeight(window.innerHeight - 336);
    drawer.style.height = '540px';
    drawer.style.bottom = '0px';
    vv.setHeight(window.innerHeight);
    expect(drawer.style.height).toBe('');
    expect(drawer.style.bottom).toBe('');
    expect(drawer).not.toHaveAttribute('data-keyboard-open');
  });
});
