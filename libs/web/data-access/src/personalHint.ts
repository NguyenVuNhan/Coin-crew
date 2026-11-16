const KEY = 'personalArea';

export function readPersonalHint(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writePersonalHint(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) {
      localStorage.setItem(KEY, '1');
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // Ignore storage errors (private browsing, disabled storage, quota)
  }
}
