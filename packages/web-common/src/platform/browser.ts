import type { PlatformBridge, PlatformStorage, ShareCard, ZaloFriend } from './index';

export function isIosDevice(nav: Navigator = navigator): boolean {
  const ua = nav?.userAgent ?? '';
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && (nav?.maxTouchPoints ?? 0) > 1);
}

const browserStorage: PlatformStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch {
      // swallow errors
    }
  },
  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {
      // swallow errors
    }
  },
};

export const browserPlatform: PlatformBridge = {
  kind: 'web',
  apiBase: '',
  storage: browserStorage,

  async share(card: ShareCard): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: card.title, text: card.text, url: card.url });
        return 'shared';
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError') {
          return 'cancelled';
        }
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        const textToCopy = card.text.includes(card.url) ? card.text : `${card.text} ${card.url}`.trim();
        await navigator.clipboard.writeText(textToCopy);
        return 'copied';
      }
    } catch {
      return 'failed';
    }

    return 'failed';
  },

  async saveImage(png: Blob, fileName: string): Promise<'saved' | 'cancelled' | 'failed'> {
    if (isIosDevice()) {
      try {
        const files = [new File([png], fileName, { type: 'image/png' })];
        if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
          try {
            await navigator.share({ files });
            return 'saved';
          } catch (err: unknown) {
            if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError') {
              return 'cancelled';
            }
            return 'failed';
          }
        }
        return 'failed';
      } catch {
        return 'failed';
      }
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
        reader.onabort = () => reject(new Error('Read aborted'));
        reader.readAsDataURL(png);
      });

      const a = document.createElement('a');
      a.download = fileName;
      a.href = dataUrl;
      document.body.appendChild(a);
      try {
        a.click();
      } finally {
        a.remove();
      }
      return 'saved';
    } catch {
      return 'failed';
    }
  },

  async openExternal(url: string): Promise<'opened' | 'blocked'> {
    try {
      window.location.assign(url);
      return 'opened';
    } catch {
      return 'blocked';
    }
  },

  async zaloAccessToken(): Promise<string | null> {
    return null;
  },

  async zaloUserInfo(): Promise<{ name: string; avatar: string } | 'declined' | null> {
    return null;
  },

  async chatContext(): Promise<{ type: 'user' | 'group'; id: string } | null> {
    return null;
  },

  async pickZaloFriends(_max: number): Promise<ZaloFriend[] | null> {
    return null;
  },
};
