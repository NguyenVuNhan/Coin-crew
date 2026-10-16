import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setLang } from '../i18n';

// The app starts in Vietnamese; tests read the English copy unless they switch.
beforeEach(() => setLang('en'));

afterEach(() => {
  cleanup();
  localStorage.clear();
});
