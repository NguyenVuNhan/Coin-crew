import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider, type PlatformBridge, type ShareCard } from '@cc/web-platform';
import { mockMedia } from '../../test/media';
import { useImageShare, type ImageShareRequest, type ImageShareStatus } from '../useImageShare';

const card: ShareCard = { title: 'T', description: 'D', path: 'j/x/owe', thumbnailUrl: 'th', text: 'hello', url: 'u' };

function request(pcPicture: boolean): ImageShareRequest {
  return {
    render: async () => new Blob(['png'], { type: 'image/png' }),
    text: 'hello',
    fileName: 'request.png',
    card,
    pcPicture,
  };
}

let api: { share(req: ImageShareRequest): Promise<void>; status: ImageShareStatus };

function Harness() {
  const s = useImageShare();
  api = s;
  return (
    <>
      <p data-testid="status">{String(s.status)}</p>
      {s.sheet}
    </>
  );
}

function mount(platform: PlatformBridge = browserPlatform) {
  setLang('en');
  return render(
    <PlatformProvider platform={platform}>
      <Harness />
    </PlatformProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useImageShare', () => {
  it('PC copies the text then opens the picture sheet when pcPicture', async () => {
    mockMedia({ mouse: true });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Chrome', clipboard: { writeText } });
    mount();
    await act(() => api.share(request(true)));
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(screen.getByTestId('status').textContent).toBe('copied');
    await waitFor(() => expect(document.querySelector('.fsl-save-image')).not.toBeNull());
  });

  it('PC picture sheet uses neutral desktop copy and copies once', async () => {
    mockMedia({ mouse: true });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Chrome', clipboard: { writeText } });
    mount();
    await act(() => api.share(request(true)));
    const sheet = await waitFor(() => {
      const el = document.querySelector('.fsl-save-image');
      expect(el).not.toBeNull();
      return el!;
    });
    await waitFor(() => expect(sheet.textContent).toContain('Right-click the picture'));
    expect(sheet.textContent).not.toMatch(/Zalo|Press and hold|Open in browser/);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('PC with pcPicture false only copies', async () => {
    mockMedia({ mouse: true });
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Chrome', clipboard: { writeText: vi.fn(async () => undefined) } });
    mount();
    await act(() => api.share(request(false)));
    expect(screen.getByTestId('status').textContent).toBe('copied');
    expect(document.querySelector('.fsl-save-image')).toBeNull();
  });

  it('Mini App saves the image and shares the card', async () => {
    mockMedia({});
    const share = vi.fn(async () => 'shared' as const);
    const saveImage = vi.fn(async () => 'saved' as const);
    mount({ ...browserPlatform, kind: 'zmp', share, saveImage });
    await act(() => api.share(request(true)));
    expect(saveImage).toHaveBeenCalledWith(expect.any(Blob), 'request.png');
    expect(share).toHaveBeenCalledWith(card);
    expect(screen.getByTestId('status').textContent).toBe('saved');
  });

  it('phone browser shares the file with the text', async () => {
    mockMedia({});
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mobile Safari', share, canShare: () => true });
    mount();
    await act(() => api.share(request(true)));
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], text: 'hello' });
    expect(screen.getByTestId('status').textContent).toBe('null');
  });

  it('cancelling the share sheet shows no failure', async () => {
    mockMedia({});
    const share = vi.fn(async () => {
      throw Object.assign(new Error('cancel'), { name: 'AbortError' });
    });
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mobile Safari', share, canShare: () => true });
    mount();
    await act(() => api.share(request(true)));
    expect(screen.getByTestId('status').textContent).toBe('null');
  });
});
