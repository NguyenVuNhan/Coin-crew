import { describe, it, expect } from 'vitest';
import { BANK_APPS, searchBankApps, type BankApp } from '../src/banks';

describe('searchBankApps', () => {
  const apps: BankApp[] = [
    { appId: 'vcb', appName: 'VCB Digibank', bankName: 'Ngân hàng TMCP Ngoại Thương Việt Nam', bankShortName: 'Vietcombank', bankCode: 'VCB', monthlyInstall: 300000 },
    { appId: 'acb', appName: 'ACB ONE', bankName: 'Ngân hàng TMCP Á Châu', bankShortName: 'ACB', bankCode: 'ACB', monthlyInstall: 70000 },
    { appId: 'mb', appName: 'MB Bank', bankName: 'Ngân hàng TMCP Quân đội', bankShortName: 'MBBank', bankCode: 'MB', monthlyInstall: 500000 },
    { appId: 'lpb', appName: 'LPBank', bankName: 'Ngân hàng TMCP Bưu Điện Liên Việt', bankShortName: null, bankCode: null, monthlyInstall: 10000 },
  ];
  it('empty or blank query lists every app, most installed first', () => {
    expect(searchBankApps(apps, '').map((a) => a.appId)).toEqual(['mb', 'vcb', 'acb', 'lpb']);
    expect(searchBankApps(apps, '   ').map((a) => a.appId)).toEqual(['mb', 'vcb', 'acb', 'lpb']);
  });
  it('matches code, app name, short name and full name, ignoring case, accents and spaces', () => {
    expect(searchBankApps(apps, 'VCB ').map((a) => a.appId)).toEqual(['vcb']);
    expect(searchBankApps(apps, 'á châu').map((a) => a.appId)).toEqual(['acb']);
    expect(searchBankApps(apps, 'a chau').map((a) => a.appId)).toEqual(['acb']);
    expect(searchBankApps(apps, 'vietcom').map((a) => a.appId)).toEqual(['vcb']);
    expect(searchBankApps(apps, 'buu dien').map((a) => a.appId)).toEqual(['lpb']);
  });
  it('matches from the start of a word, so vcb does not find pvcb', () => {
    const withPvcb: BankApp[] = [...apps, { appId: 'pvcb', appName: 'PVConnect', bankName: 'Ngân hàng TMCP Đại Chúng Việt Nam', bankShortName: 'PVcomBank', bankCode: 'PVCB', monthlyInstall: 900000 }];
    expect(searchBankApps(withPvcb, 'vcb').map((a) => a.appId)).toEqual(['vcb']);
    expect(searchBankApps(withPvcb, 'pv').map((a) => a.appId)).toEqual(['pvcb']);
  });
  it('no match gives an empty list', () => {
    expect(searchBankApps(apps, 'zzz')).toEqual([]);
  });
  it('the shipped lists have both platforms, unique ids, no autofill field', () => {
    for (const list of [BANK_APPS.android, BANK_APPS.ios]) {
      expect(list.length).toBeGreaterThan(20);
      expect(new Set(list.map((a) => a.appId)).size).toBe(list.length);
      expect(list.every((a) => !('autofill' in a))).toBe(true);
    }
  });
});
