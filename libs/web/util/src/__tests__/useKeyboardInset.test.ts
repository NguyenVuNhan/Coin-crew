import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardInset } from '../useKeyboardInset';

class MockVisualViewport extends EventTarget {
  height: number;
  offsetTop: number;

  constructor(height = 800, offsetTop = 0) {
    super();
    this.height = height;
    this.offsetTop = offsetTop;
  }
}

describe('useKeyboardInset', () => {
  let originalInnerHeight: number;
  let originalVisualViewport: VisualViewport | null | undefined;

  beforeEach(() => {
    originalInnerHeight = window.innerHeight;
    originalVisualViewport = window.visualViewport;
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: originalVisualViewport,
    });
  });

  function setViewport({ height = 800, offsetTop = 0 }: { height?: number; offsetTop?: number } = {}): MockVisualViewport {
    const vv = new MockVisualViewport(height, offsetTop);
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: vv,
    });
    return vv;
  }

  it('is 0 without a keyboard', () => {
    setViewport({ height: 800, offsetTop: 0 });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it('is the covered height when the keyboard is up', () => {
    const vv = setViewport({ height: 800, offsetTop: 0 });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);

    act(() => {
      vv.height = 500;
      vv.offsetTop = 0;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(300);
  });

  it('subtracts the page scroll offset', () => {
    const vv = setViewport({ height: 800, offsetTop: 0 });
    const { result } = renderHook(() => useKeyboardInset());

    act(() => {
      vv.height = 500;
      vv.offsetTop = 40;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(260);
  });

  it('is 0 when disabled', () => {
    const vv = setViewport({ height: 500, offsetTop: 0 });
    const { result } = renderHook(() => useKeyboardInset(false));
    expect(result.current).toBe(0);

    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(0);
  });

  it('is 0 without visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });
});
