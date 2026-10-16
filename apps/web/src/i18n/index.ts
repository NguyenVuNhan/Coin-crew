import { useSyncExternalStore } from 'react';
import { en, type MessageKey } from './en';
import { vi } from './vi';

export type Lang = 'vi' | 'en';

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem('lang');
    if (stored === 'vi' || stored === 'en') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }

  // Vietnamese first, whatever the phone's language: English only when the person picked it.
  return 'vi';
}

let currentLang: Lang = detectLang();

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem('lang', lang);
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
  }
  for (const listener of listeners) {
    listener();
  }
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const dictionary = currentLang === 'vi' ? vi : en;
  let message: string = dictionary[key] ?? en[key] ?? key;
  if (vars) {
    message = message.replace(/\{(\w+)\}/g, (match, varName) => {
      if (varName in vars && vars[varName] !== undefined) {
        return String(vars[varName]);
      }
      return match;
    });
  }
  return message;
}

export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLang, () => currentLang);
  return t;
}

export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(subscribe, getLang, () => currentLang);
  return [lang, setLang];
}
