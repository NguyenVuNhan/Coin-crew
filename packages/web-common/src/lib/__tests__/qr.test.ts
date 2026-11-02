import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qrSrc, saveQr, shareQr, useQrSvg } from '../qr';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h1v1H0z"/></svg>';

/** jsdom has no canvas: draw nothing, and hand back a PNG-typed blob. */
function stubCanvas(drawable = true) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
    drawable ? { fillStyle: '', fillRect: () => {}, drawImage: () => {} } : null) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['png'], { type: 'image/png' })));
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
}

/** Records what the page "downloads" instead of navigating. */
function captureDownloads(): string[] {
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return names;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:qr');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('qrSrc', () => {
  it('turns the SVG into an image source, and nothing into nothing', () => {
    expect(qrSrc(SVG)).toBe('data:image/svg+xml;utf8,' + encodeURIComponent(SVG));
    expect(qrSrc('')).toBe('');
  });
});

describe('saveQr', () => {
  it('downloads a PNG named after the transfer note', async () => {
    stubCanvas();
    const downloads = captureDownloads();
    await saveQr(SVG, 'DALAT C7K2');
    expect(downloads).toEqual(['vietqr-DALAT-C7K2.png']);
  });

  it('does nothing where the picture cannot be drawn', async () => {
    stubCanvas(false);
    const downloads = captureDownloads();
    await saveQr(SVG, 'DALAT C7K2');
    expect(downloads).toEqual([]);
  });
});

describe('shareQr', () => {
  it('shares the picture and the message through the share sheet', async () => {
    stubCanvas();
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true });
    const downloads = captureDownloads();

    await expect(shareQr(SVG, 'Hi Chi!', 'DALAT C7K2')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.text).toBe('Hi Chi!');
    expect(data.files).toHaveLength(1);
    expect(data.files![0]).toMatchObject({ name: 'vietqr-DALAT-C7K2.png', type: 'image/png' });
    expect(downloads).toEqual([]);
  });

  it('closing the share sheet is not a failure and does not save anything', async () => {
    stubCanvas();
    const share = vi.fn(async () => {
      throw new DOMException('closed', 'AbortError');
    });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: { writeText } });
    const downloads = captureDownloads();

    await expect(shareQr(SVG, 'Hi', 'REF')).resolves.toBe('shared');
    expect(downloads).toEqual([]);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('without file sharing it saves the picture and copies the message', async () => {
    stubCanvas();
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => false, clipboard: { writeText } });
    const downloads = captureDownloads();

    await expect(shareQr(SVG, 'Hi Chi!', 'DALAT C7K2')).resolves.toBe('saved');
    expect(share).not.toHaveBeenCalled();
    expect(downloads).toEqual(['vietqr-DALAT-C7K2.png']);
    expect(writeText).toHaveBeenCalledWith('Hi Chi!');
  });

  it('a share sheet that errors falls back the same way', async () => {
    stubCanvas();
    const share = vi.fn(async () => {
      throw new Error('boom');
    });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: { writeText } });
    const downloads = captureDownloads();

    await expect(shareQr(SVG, 'Hi', 'REF')).resolves.toBe('saved');
    expect(downloads).toEqual(['vietqr-REF.png']);
    expect(writeText).toHaveBeenCalledWith('Hi');
  });

  it('fails only when nothing at all worked', async () => {
    stubCanvas(false);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: undefined });
    await expect(shareQr(SVG, 'Hi', 'REF')).resolves.toBe('failed');
  });
});

describe('useQrSvg', () => {
  it('makes the picture for a payload, and nothing for no payload', async () => {
    const { result, rerender } = renderHook(({ payload }: { payload: string | null }) => useQrSvg(payload), {
      initialProps: { payload: 'PAYLOAD-A' as string | null },
    });
    expect(result.current).toBe('');
    await waitFor(() => expect(result.current).toMatch(/^<svg/));
    rerender({ payload: null });
    expect(result.current).toBe('');
  });

  it('never shows the picture of the old payload while a new one is being made', async () => {
    const seen: { payload: string; svg: string }[] = [];
    const { result, rerender } = renderHook(
      ({ payload }: { payload: string }) => {
        const svg = useQrSvg(payload);
        seen.push({ payload, svg });
        return svg;
      },
      { initialProps: { payload: 'PAYLOAD-A' } },
    );
    await waitFor(() => expect(result.current).toMatch(/^<svg/));
    const pictureA = result.current;

    rerender({ payload: 'PAYLOAD-B' });
    await waitFor(() => expect(result.current).toMatch(/^<svg/));
    expect(result.current).not.toBe(pictureA);

    // Every render for B, including the first one before B's picture was ready, held either nothing or B's own.
    const forB = seen.filter((s) => s.payload === 'PAYLOAD-B');
    expect(forB.length).toBeGreaterThan(1);
    expect(forB.some((s) => s.svg === pictureA)).toBe(false);
  });
});
