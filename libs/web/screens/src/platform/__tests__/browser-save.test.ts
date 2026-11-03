import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { browserPlatform, isIosDevice } from '../browser';

describe('browserPlatform.saveImage & isIosDevice', () => {
  let originalUserAgent: PropertyDescriptor | undefined;
  let originalMaxTouchPoints: PropertyDescriptor | undefined;
  let originalShare: PropertyDescriptor | undefined;
  let originalCanShare: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    originalMaxTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
    originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    function restoreProp(prop: string, desc: PropertyDescriptor | undefined) {
      if (desc) {
        Object.defineProperty(navigator, prop, desc);
      } else {
        delete (navigator as unknown as Record<string, unknown>)[prop];
      }
    }

    restoreProp('userAgent', originalUserAgent);
    restoreProp('maxTouchPoints', originalMaxTouchPoints);
    restoreProp('share', originalShare);
    restoreProp('canShare', originalCanShare);
  });

  function setNavigatorProperty(property: string, value: unknown) {
    Object.defineProperty(navigator, property, {
      value,
      configurable: true,
      writable: true,
    });
  }

  it('iPhone shares the PNG as a file and reports saved', async () => {
    setNavigatorProperty('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    const canShareMock = vi.fn().mockReturnValue(true);
    const shareMock = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty('canShare', canShareMock);
    setNavigatorProperty('share', shareMock);

    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    const result = await browserPlatform.saveImage(blob, 'vietqr-123.png');

    expect(result).toBe('saved');
    expect(shareMock).toHaveBeenCalledWith({
      files: [expect.any(File)],
    });
    const shareArg = shareMock.mock.calls[0]?.[0] as { files: File[] };
    expect(shareArg).toBeDefined();
    expect(shareArg.files).toHaveLength(1);
    const file = shareArg.files[0]!;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('vietqr-123.png');
    expect(file.type).toBe('image/png');
  });

  it('iPhone share cancelled reports cancelled', async () => {
    setNavigatorProperty('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    const canShareMock = vi.fn().mockReturnValue(true);
    const shareMock = vi.fn().mockRejectedValue({ name: 'AbortError' });
    setNavigatorProperty('canShare', canShareMock);
    setNavigatorProperty('share', shareMock);

    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    const result = await browserPlatform.saveImage(blob, 'vietqr-123.png');

    expect(result).toBe('cancelled');
  });

  it('iPhone without file sharing reports failed and does not download', async () => {
    setNavigatorProperty('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    const canShareMock = vi.fn().mockReturnValue(false);
    const shareMock = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty('canShare', canShareMock);
    setNavigatorProperty('share', shareMock);

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    const result = await browserPlatform.saveImage(blob, 'vietqr-123.png');

    expect(result).toBe('failed');
    expect(shareMock).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('iPadOS (Macintosh UA with touch) counts as iOS', () => {
    setNavigatorProperty('userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    setNavigatorProperty('maxTouchPoints', 5);
    expect(isIosDevice()).toBe(true);

    setNavigatorProperty('maxTouchPoints', 0);
    expect(isIosDevice()).toBe(false);
  });

  it('Android downloads a data: URL, not a blob: URL', async () => {
    setNavigatorProperty('userAgent', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    let clickedHref = '';
    let clickedDownload = '';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
      clickedDownload = this.download;
    });

    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    const result = await browserPlatform.saveImage(blob, 'vietqr-123.png');

    expect(result).toBe('saved');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clickedHref.startsWith('data:image/png;base64,')).toBe(true);
    expect(clickedHref).not.toContain('blob:');
    expect(clickedDownload).toBe('vietqr-123.png');
  });
});
