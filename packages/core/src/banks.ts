import banks from './data/banks.json';
import bankApps from './data/bank-apps.json';
import { normalizeName } from './names';

export interface Bank { bin: string; shortName: string; name: string; code: string }
export interface BankApp {
  appId: string;
  appName: string;
  bankName: string;
  bankShortName: string | null;
  bankCode: string | null;
  monthlyInstall: number;
}

export const BANKS: Bank[] = banks;
export const BANK_APPS: { android: BankApp[]; ios: BankApp[] } = bankApps as unknown as {
  android: BankApp[];
  ios: BankApp[];
};

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

/** Apps whose id, code, app name or bank name has a word starting with the query (accents ignored), most installed first. */
export function searchBankApps(apps: BankApp[], query: string): BankApp[] {
  const q = normalizeName(query.trim());
  const filtered = q
    ? apps.filter((app) =>
        [app.appId, app.appName, app.bankShortName, app.bankCode, app.bankName].some(
          (field) => field !== null && ` ${normalizeName(field)}`.includes(` ${q}`),
        ),
      )
    : [...apps];
  return filtered.sort((a, b) => b.monthlyInstall - a.monthlyInstall);
}
