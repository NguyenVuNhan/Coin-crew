import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '@cc/web-i18n';
import { linkTokens } from '@cc/web-util/linkTokens';
import { tripView, PIDS } from '../../test/fixtures';
import { expenseBillText, groupRequestText, payLink } from '../remind';
import { expenseBillCard, groupRequestCard } from '../shareCards';
import { requestTotalRows } from '../owe';

const L = 'https://x/j/gtok-1/e/e-1';

afterEach(() => {
  localStorage.clear();
  setLang('en');
});

describe('groupRequestText', () => {
  it('vi lists each debtor and ends with the link', () => {
    expect(
      groupRequestText('vi', {
        trip: 'Đà Lạt',
        creditor: 'Minh',
        rows: [
          { name: 'Chi', amount: 1245000 },
          { name: 'An', amount: 385000 },
        ],
        link: 'https://x/j/gtok-1/owe',
      }),
    ).toBe('Nhóm "Đà Lạt", cần chuyển cho Minh:\n• Chi 1.245.000₫\n• An 385.000₫\nChọn tên mình để xem mã QR: https://x/j/gtok-1/owe');
  });

  it('en starts with the English head', () => {
    const text = groupRequestText('en', { trip: 'Đà Lạt', creditor: 'Minh', rows: [{ name: 'An', amount: 1000 }], link: 'L' });
    expect(text.startsWith('"Đà Lạt": please send Minh:')).toBe(true);
    expect(text.endsWith('Pick your name to see your QR: L')).toBe(true);
  });
});

describe('expenseBillText', () => {
  it('equal split says each person pays the same', () => {
    expect(
      expenseBillText('vi', {
        description: 'Lẩu',
        total: 900000,
        shares: [
          { name: 'A', amount: 300000 },
          { name: 'B', amount: 300000 },
        ],
        link: L,
      }),
    ).toBe('Lẩu: 900.000₫, mỗi người 300.000₫.\nMã QR & chi tiết: ' + L);
  });

  it('uneven split lists each share', () => {
    expect(
      expenseBillText('vi', {
        description: 'Lẩu',
        total: 900000,
        shares: [
          { name: 'A', amount: 100000 },
          { name: 'B', amount: 200000 },
        ],
        link: L,
      }),
    ).toBe('Lẩu: 900.000₫. A 100.000₫, B 200.000₫.\nMã QR & chi tiết: ' + L);
  });
});

describe('expenseBillText with a zero share', () => {
  it('leaves out people who owe nothing', () => {
    expect(
      expenseBillText('vi', {
        description: 'Lẩu',
        total: 900000,
        shares: [
          { name: 'A', amount: 0 },
          { name: 'B', amount: 300000 },
          { name: 'C', amount: 300000 },
        ],
        link: L,
      }),
    ).toBe('Lẩu: 900.000₫, mỗi người 300.000₫.\nMã QR & chi tiết: ' + L);
  });
});

describe('requestTotalRows', () => {
  it('returns suggestions into me in view order', () => {
    expect(requestTotalRows(tripView()).map((r) => r.fromId)).toEqual([PIDS.C, PIDS.B, PIDS.A]);
  });

  it('is empty when archived, for a viewer, or when nothing comes in', () => {
    const v = tripView();
    expect(requestTotalRows({ ...v, trip: { ...v.trip, archived: true } })).toEqual([]);
    expect(requestTotalRows({ ...v, me: { ...v.me, kind: 'viewer' } })).toEqual([]);
    expect(requestTotalRows({ ...v, suggestions: [{ fromId: PIDS.M, toId: PIDS.A, amount: 1000 }] })).toEqual([]);
  });
});

describe('cards', () => {
  it('groupRequestCard goes to the owe page', () => {
    const card = groupRequestCard(tripView(), 'txt', 'https://o');
    expect(card.path).toBe('j/gtok-1/owe');
    expect(card.url).toBe('https://o/j/gtok-1/owe');
    expect(card.text).toBe('txt');
  });

  it('expenseBillCard uses the root id', () => {
    const card = expenseBillCard(tripView(), 'e-root', 'txt', 'https://o');
    expect(card.path).toBe('j/gtok-1/e/e-root');
    expect(card.url).toBe('https://o/j/gtok-1/e/e-root');
  });
});

describe('payLink for a guest', () => {
  it('falls back to the stored link token', () => {
    linkTokens.set('t-1', 'gtok-g');
    const v = tripView({ links: undefined, me: { kind: 'guest', participantId: PIDS.C, participantPending: false, isOrganiser: false } });
    expect(payLink(v).endsWith('/j/gtok-g/owe')).toBe(true);
  });
});
