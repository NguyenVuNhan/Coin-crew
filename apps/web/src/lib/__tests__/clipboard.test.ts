import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from '../clipboard';

const originalClipboard = navigator.clipboard;

afterEach(() => {
  delete (document as any).execCommand;
  Object.defineProperty(navigator, 'clipboard', {
    value: originalClipboard,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe('copyText', () => {
  it('uses the Clipboard API when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    const result = await copyText('hello');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    const result = await copyText('fallback text');
    expect(result).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.querySelector('textarea')).toBeNull();
  });

  it('falls back to execCommand when there is no Clipboard API', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    const result = await copyText('fallback text');
    expect(result).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.querySelector('textarea')).toBeNull();
  });

  it('is false when both are blocked', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const execCommand = vi.fn(() => false);
    document.execCommand = execCommand;

    const result = await copyText('blocked text');
    expect(result).toBe(false);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.body.querySelector('textarea')).toBeNull();
  });

  it('starts the Clipboard API call synchronously', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const p = copyText('x');
    expect(writeText).toHaveBeenCalledWith('x');
    await p;
  });
});
