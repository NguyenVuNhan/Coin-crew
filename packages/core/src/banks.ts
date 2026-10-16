import banks from './data/banks.json';
import bankApps from './data/bank-apps.json';

export interface Bank { bin: string; shortName: string; name: string; code: string }
export interface BankApp { appId: string; appName: string; autofill: boolean }

export const BANKS: Bank[] = banks;
export const BANK_APPS: { android: BankApp[]; ios: BankApp[] } = bankApps;

// Flip only after the spec §14 real-device check of dl.vietqr.io prefill parameters.
export const PREFILL_VERIFIED = false;

/** An account number as members and payers see it: first 4 digits, " •••• ", last 4. */
export function maskAccountNumber(accountNumber: string): string {
  return `${accountNumber.slice(0, 4)} •••• ${accountNumber.slice(-4)}`;
}

export function findBank(bin: string): Bank | undefined {
  return BANKS.find((b) => b.bin === bin);
}

export function bankAppLink(appId: string): string {
  return `https://dl.vietqr.io/pay?app=${encodeURIComponent(appId)}`;
}
