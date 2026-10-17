import { describe, it, expect } from 'vitest';
import { crc16CcittFalse, buildVietQrPayload, toTransferNote } from '../src/vietqr';
import { makeRefCode } from '../src/refcode';
import { findBank, BANK_APPS, bankAppLink } from '../src/banks';

describe('VietQR payload', () => {
  it('CRC-16/CCITT-FALSE check value', () => expect(crc16CcittFalse('123456789')).toBe('29B1'));
  it('builds the NAPAS account-transfer payload', () =>
    expect(buildVietQrPayload({ bin: '970407', accountNumber: '19031234565678', amount: 1245000, note: 'DALAT C7K2' }))
      .toBe('00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572'));
  it('builds a static NAPAS QR (tag 01=11, no tag 54) when amount is 0', () => {
    const p = buildVietQrPayload({ bin: '970407', accountNumber: '19031234565678', amount: 0, note: 'CAU LONG T5' });
    expect(p.startsWith('000201010211')).toBe(true);
    expect(p).not.toContain('54010');
    expect(p.slice(-4)).toBe(crc16CcittFalse(p.slice(0, -4)));
  });
});

describe('toTransferNote', () => {
  it('strips accents and symbols, uppercases', () => expect(toTransferNote('Đà Lạt – chị Chi!')).toBe('DA LAT CHI CHI'));
  it('cuts to 25 characters by default', () => expect(toTransferNote('x'.repeat(40))).toHaveLength(25));
  it('accepts a longer limit for holder names', () => expect(toTransferNote('Nguyễn Văn Minh Quang Trung Hiếu', 50)).toBe('NGUYEN VAN MINH QUANG TRUNG HIEU'));
});

describe('makeRefCode', () => {
  it('first two words of the trip name', () => expect(makeRefCode('Đà Lạt · Oct 2026', () => 0)).toBe('DALAT 2222'));
  it('cut to 6 characters', () => expect(makeRefCode('Phú Quốc 2027', () => 0)).toBe('PHUQUO 2222'));
  it('falls back to TRIP', () => expect(makeRefCode('🎉', () => 0)).toBe('TRIP 2222'));
  it('uses the last alphabet character for random near 1', () => expect(makeRefCode('Tết', () => 0.9999)).toBe('TET ZZZZ'));
});

describe('bank data', () => {
  it('finds Techcombank by BIN', () => expect(findBank('970407')?.shortName).toBe('Techcombank'));
  it('five Android apps can prefill (spec §9.3)', () => expect(BANK_APPS.android.filter((a) => a.autofill)).toHaveLength(5));
  it('deeplink format', () => expect(bankAppLink('vcb')).toBe('https://dl.vietqr.io/pay?app=vcb'));
});
