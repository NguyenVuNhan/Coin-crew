/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

const files = import.meta.glob('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const ALLOWED: Record<string, string> = {
  '../src/participants/remove.ts':
    'Builds BatchItem queries only; all callers commit them via commitTripWrite.',
  '../src/auth/mergeUsers.ts':
    "Account merge folds ledgers in one batch that also bumps both users' personal epoch, so their saved copies download again.",
};

describe('personal sync write guards', () => {
  it('every ALLOWED key exists in source files', () => {
    for (const key of Object.keys(ALLOWED)) {
      expect(files, `stale ALLOWED entry: ${key}`).toHaveProperty(key);
    }
  });

  it('personalTransactions writes use commitPersonalWrite', () => {
    const pattern = /(insert|update|delete)\(personalTransactions\b/;
    const offenders = Object.entries(files)
      .filter(([, text]) => pattern.test(text) && !text.includes('commitPersonalWrite'))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });

  it('transactions and transactionShares writes use commitTripWrite or guardedTripWrite', () => {
    const pattern = /(insert|update)\(transactions\)|(insert|update|delete)\(transactionShares\)/;
    const offenders = Object.entries(files)
      .filter(
        ([path, text]) =>
          !(path in ALLOWED) &&
          pattern.test(text) &&
          !text.includes('commitTripWrite') &&
          !text.includes('guardedTripWrite'),
      )
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
