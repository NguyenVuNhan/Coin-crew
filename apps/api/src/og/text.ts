import { formatVnd } from '@fsl/core';
import type { ExpenseView } from '@fsl/core';
import type { TripSnapshot } from '../trips/snapshot';

export type PageMetaInput =
  | { kind: 'generic' }
  | { kind: 'dead' }
  | { kind: 'group'; snapshot: TripSnapshot; now: Date }
  | { kind: 'expense'; snapshot: TripSnapshot; expense: ExpenseView; now: Date };

export interface PageMeta {
  title: string;
  description: string;
  image: 'trip' | 'sport';
  locale: 'vi_VN' | 'en_US';
}

export type OgTextKey =
  | 'appTitle'
  | 'genericDesc'
  | 'deadDesc'
  | 'groupSportPrefix'
  | 'groupWithTotal'
  | 'groupEmpty'
  | 'expenseOther'
  | 'sportCourt'
  | 'sportShuttlecocks'
  | 'sportExtra'
  | 'sportMaleFemaleRate'
  | 'sportPerSlotRate'
  | 'sportSuffix';

export const OG_TEXT: Record<'vi' | 'en', Record<OgTextKey, string>> = {
  vi: {
    appTitle: 'CoinCrew (Tiền Đâu)',
    genericDesc: 'Chia tiền nhóm, trả nhau bằng VietQR.',
    deadDesc: 'Link này không còn dùng được. Hỏi người tạo nhóm link mới.',
    groupSportPrefix: 'Nhóm thể thao · ',
    groupWithTotal: 'Đến {date}: tổng chi {total} · {n} người — mở để xem ai cần trả ai bao nhiêu.',
    groupEmpty: 'Chưa có chi tiêu nào · {n} người — mở để thêm và chia tiền.',
    expenseOther: '{amount} · chia {k} người — mở để xem phần của bạn.',
    sportCourt: 'Sân {court}',
    sportShuttlecocks: 'Cầu {shuttlecocks}',
    sportExtra: 'Phụ phí {extra}',
    sportMaleFemaleRate: 'Nam {male} / Nữ {female}',
    sportPerSlotRate: 'Mỗi suất {rate}',
    sportSuffix: ' — mở để lấy mã QR.',
  },
  en: {
    appTitle: 'CoinCrew (Tiền Đâu)',
    genericDesc: 'Split group costs and settle up with VietQR.',
    deadDesc: 'This link no longer works. Ask the organiser for a new one.',
    groupSportPrefix: 'Sport group · ',
    groupWithTotal: 'As of {date}: {total} spent · {n} people — open to see who owes whom.',
    groupEmpty: 'No expenses yet · {n} people — open to add and split.',
    expenseOther: '{amount} · split {k} ways — open to see your share.',
    sportCourt: 'Court {court}',
    sportShuttlecocks: 'Shuttlecocks {shuttlecocks}',
    sportExtra: 'Extra {extra}',
    sportMaleFemaleRate: 'Men {male} / Women {female}',
    sportPerSlotRate: 'Per slot {rate}',
    sportSuffix: ' — open for your QR.',
  },
};

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1) + '…';
}

function formatDate(date: Date, lang: 'vi' | 'en'): string {
  if (lang === 'vi') {
    const parts = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).formatToParts(date);
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    return `${day}/${month}`;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = (parts.find((p) => p.type === 'month')?.value ?? '').replace(/\.$/, '');
  return `${day} ${month}`;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

export function pageMeta(input: PageMetaInput): PageMeta {
  if (input.kind === 'generic') {
    const t = OG_TEXT.vi;
    return {
      title: t.appTitle,
      description: t.genericDesc,
      image: 'trip',
      locale: 'vi_VN',
    };
  }

  if (input.kind === 'dead') {
    const t = OG_TEXT.vi;
    return {
      title: t.appTitle,
      description: t.deadDesc,
      image: 'trip',
      locale: 'vi_VN',
    };
  }

  const { snapshot, now } = input;
  const lang = snapshot.trip.defaultLang ?? 'vi';
  const t = OG_TEXT[lang];
  const image: PageMeta['image'] = snapshot.trip.preset === 'sport' ? 'sport' : 'trip';
  const locale: PageMeta['locale'] = lang === 'en' ? 'en_US' : 'vi_VN';

  if (input.kind === 'group') {
    const date = formatDate(now, lang);
    const n = snapshot.people.filter((p) => p.status === 'active').length;
    const total = snapshot.trip.total ?? 0;
    let description = total > 0
      ? interpolate(t.groupWithTotal, { date, total: formatVnd(total), n })
      : interpolate(t.groupEmpty, { n });

    if (snapshot.trip.preset === 'sport') {
      description = t.groupSportPrefix + description;
    }

    return {
      title: truncate(snapshot.trip.name, 90),
      description: truncate(description, 200),
      image,
      locale,
    };
  }

  const { expense } = input;
  const rawTitle = expense.description
    ? `${expense.description} · ${snapshot.trip.name}`
    : snapshot.trip.name;

  let rawDescription: string;
  const sport = expense.meta?.sport;
  if (sport) {
    const parts: string[] = [];
    if (sport.court > 0) {
      parts.push(interpolate(t.sportCourt, { court: formatVnd(sport.court) }));
    }
    const shuttlecocksTotal = (sport.shuttlecocks ?? []).reduce(
      (sum, s) => sum + (s.qty || 0) * (s.unitPrice || 0),
      0,
    );
    if (shuttlecocksTotal > 0) {
      parts.push(interpolate(t.sportShuttlecocks, { shuttlecocks: formatVnd(shuttlecocksTotal) }));
    }
    if (sport.extra > 0) {
      parts.push(interpolate(t.sportExtra, { extra: formatVnd(sport.extra) }));
    }

    let maleSlots = 0;
    let femaleSlots = 0;
    for (const entry of sport.entries ?? []) {
      if (entry.fixedAmount == null) {
        maleSlots += entry.maleSlots ?? 0;
        femaleSlots += entry.femaleSlots ?? 0;
      }
    }

    if (maleSlots > 0 && femaleSlots > 0 && sport.maleSlotRate !== sport.femaleSlotRate) {
      parts.push(
        interpolate(t.sportMaleFemaleRate, {
          male: formatVnd(sport.maleSlotRate),
          female: formatVnd(sport.femaleSlotRate),
        }),
      );
    } else {
      const rate = maleSlots > 0 ? sport.maleSlotRate : sport.femaleSlotRate;
      parts.push(interpolate(t.sportPerSlotRate, { rate: formatVnd(rate) }));
    }

    rawDescription = parts.join(' · ') + t.sportSuffix;
  } else {
    const k = expense.shares?.length ?? 0;
    rawDescription = interpolate(t.expenseOther, {
      amount: formatVnd(expense.amount),
      k,
    });
  }

  return {
    title: truncate(rawTitle, 90),
    description: truncate(rawDescription, 200),
    image,
    locale,
  };
}
