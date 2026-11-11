import { useSyncExternalStore } from 'react';
import { isZaloWebView } from '@cc/web-util/zaloEnv';
import { isIosDevice } from './browser';

export type InstallContext =
  | 'standalone'
  | 'in-app'
  | 'prompt'
  | 'android-manual'
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'desktop';

export interface InstallEnv {
  ua: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasPrompt: boolean;
}

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const KEY_DISMISSED = 'cc.install.dismissed';
const KEY_INSTALLED = 'cc.install.installed';
const KEY_VISITS = 'cc.install.visits';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the prompt just may show again
  }
}

const listeners = new Set<() => void>();
let deferred: BeforeInstallPromptEvent | null = null;
let version = 0;

function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export const installStore = {
  isDismissed: (): boolean => read(KEY_DISMISSED) === '1',
  dismiss(): void {
    write(KEY_DISMISSED, '1');
    notify();
  },
  isInstalled: (): boolean => read(KEY_INSTALLED) === '1',
  markInstalled(): void {
    write(KEY_INSTALLED, '1');
    notify();
  },
  visits(): number {
    const n = Number(read(KEY_VISITS));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  },
  countVisit(): number {
    const next = installStore.visits() + 1;
    write(KEY_VISITS, String(next));
    return next;
  },
};

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isInAppBrowser(ua: string): boolean {
  return isZaloWebView(ua) || /FBAN|FBAV|Instagram|Line\//.test(ua);
}

export function iosMajorVersion(ua: string): number | null {
  if (!/iPhone|iPad|iPod/.test(ua)) return null;
  const m = /OS (\d+)[_.]/.exec(ua) ?? /Version\/(\d+)/.exec(ua);
  return m ? Number(m[1]) : null;
}

export function currentInstallEnv(): InstallEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  let standalone = false;
  try {
    standalone =
      (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true) ||
      (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
  } catch {
    standalone = false;
  }
  return {
    ua: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone,
    hasPrompt: deferred !== null,
  };
}

export function detectInstallContext(env: InstallEnv): InstallContext {
  if (env.standalone) return 'standalone';
  if (isInAppBrowser(env.ua)) return 'in-app';
  if (env.hasPrompt) return 'prompt';
  if (/Android/.test(env.ua)) return 'android-manual';
  if (isIosDevice({ userAgent: env.ua, maxTouchPoints: env.maxTouchPoints } as Navigator)) {
    if (/CriOS/.test(env.ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS/.test(env.ua)) return 'ios-other';
    return 'ios-safari';
  }
  return 'desktop';
}

export function isMobileEnv(env: InstallEnv): boolean {
  return /Android/.test(env.ua) || isIosDevice({ userAgent: env.ua, maxTouchPoints: env.maxTouchPoints } as Navigator);
}

let captureStarted = false;

export function startInstallCapture(win: Window = window): void {
  if (captureStarted) return;
  captureStarted = true;
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  win.addEventListener('appinstalled', () => {
    deferred = null;
    installStore.markInstalled();
  });
}

export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  notify();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
      installStore.markInstalled();
      return 'accepted';
    }
    return 'dismissed';
  } catch {
    return 'dismissed';
  }
}

interface InstallSnapshot {
  context: InstallContext;
  mobile: boolean;
  installed: boolean;
}

let cached: { v: number; snap: InstallSnapshot } | null = null;

function snapshot(): InstallSnapshot {
  if (cached && cached.v === version) return cached.snap;
  const env = currentInstallEnv();
  const snap = { context: detectInstallContext(env), mobile: isMobileEnv(env), installed: installStore.isInstalled() };
  cached = { v: version, snap };
  return snap;
}

const serverSnapshot: InstallSnapshot = { context: 'desktop', mobile: false, installed: false };

export function useInstallPrompt(): InstallSnapshot & { prompt: () => Promise<InstallOutcome> } {
  const snap = useSyncExternalStore(subscribeInstall, snapshot, () => serverSnapshot);
  return { ...snap, prompt: promptInstall };
}
