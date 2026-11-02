import type { PlatformBridge, PlatformStorage, ShareCard, ZaloFriend } from './index';

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

  async saveImage(png: Blob, fileName: string): Promise<'saved' | 'failed'> {
    try {
      const url = URL.createObjectURL(png);
      const a = document.createElement('a');
      a.download = fileName;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
