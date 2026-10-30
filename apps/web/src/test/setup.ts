import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setLang } from '../i18n';

// Radix and vaul (shadcn's Dialog, Drawer, menus) call browser APIs jsdom lacks.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// The app starts in Vietnamese; tests read the English copy unless they switch.
beforeEach(() => setLang('en'));

afterEach(() => {
  cleanup();
  localStorage.clear();
});
