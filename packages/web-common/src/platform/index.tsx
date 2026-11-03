import { createContext, useContext, type ReactNode, type JSX } from 'react';
import { browserPlatform } from './browser';

export interface ShareCard {
  title: string;
  description: string;
  path: string;
  thumbnailUrl: string;
  text: string;
  url: string;
}

export interface ZaloFriend {
  zaloId: string;
  name: string;
  avatar: string;
}

export interface PlatformStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PlatformBridge {
  kind: 'web' | 'zmp';
  apiBase: string;
  storage: PlatformStorage;
  share(card: ShareCard): Promise<'shared' | 'copied' | 'cancelled' | 'failed'>;
  saveImage(png: Blob, fileName: string): Promise<'saved' | 'cancelled' | 'failed'>;
  openExternal(url: string): Promise<'opened' | 'blocked'>;
  zaloAccessToken(): Promise<string | null>;
  zaloUserInfo(): Promise<{ name: string; avatar: string } | 'declined' | null>;
  chatContext(): Promise<{ type: 'user' | 'group'; id: string } | null>;
  pickZaloFriends(max: number): Promise<ZaloFriend[] | null>;
}

const PlatformContext = createContext<PlatformBridge>(browserPlatform);

export function PlatformProvider({
  platform,
  children,
}: {
  platform: PlatformBridge;
  children: ReactNode;
}): JSX.Element {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformBridge {
  return useContext(PlatformContext);
}

export { browserPlatform } from './browser';
