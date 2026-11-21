import { BANK_APPS, foldForSearch, type BankApp } from '@cc/core';
import type { IconName } from '@cc/web-ui/components/icons';
import { bankAppLogo } from './bankApps';

export const WALLET_PASTEL_TONES = ['1', '2', '3', '4', '5', '6', 't', 'n'] as const;
export type WalletPastelTone = (typeof WALLET_PASTEL_TONES)[number];

export const WALLET_AVATAR_TONES = ['1', '2', '3', '4', '5', '6'] as const;

const TONE_CLASSES: Record<WalletPastelTone, string> = {
  '1': 'bg-avatar-1 text-avatar-1-fg',
  '2': 'bg-avatar-2 text-avatar-2-fg',
  '3': 'bg-avatar-3 text-avatar-3-fg',
  '4': 'bg-avatar-4 text-avatar-4-fg',
  '5': 'bg-avatar-5 text-avatar-5-fg',
  '6': 'bg-avatar-6 text-avatar-6-fg',
  t: 'bg-secondary text-secondary-foreground',
  n: 'bg-muted text-foreground',
};

export type BasicWalletGlyph = 'wallet' | 'cash' | 'coins' | 'card' | 'bank' | 'vault' | 'salary' | 'jar';

interface BasicGlyphDef {
  glyph: BasicWalletGlyph;
  iconName: IconName;
  defaultTone: WalletPastelTone;
  labelVi: string;
  labelEn: string;
  keywords: readonly string[];
}

const BASIC_GLYPHS: readonly BasicGlyphDef[] = [
  { glyph: 'wallet', iconName: 'wallet', defaultTone: '5', labelVi: 'Ví', labelEn: 'Wallet', keywords: ['vi', 'wallet', 'mac dinh', 'chi tieu'] }, // REVIEW
  { glyph: 'cash', iconName: 'receipt', defaultTone: '4', labelVi: 'Tiền mặt', labelEn: 'Cash', keywords: ['tien mat', 'cash', 'giay'] }, // REVIEW
  { glyph: 'coins', iconName: 'coins', defaultTone: '1', labelVi: 'Tiền lẻ', labelEn: 'Coins', keywords: ['tien le', 'tien xu', 'coins'] }, // REVIEW
  { glyph: 'card', iconName: 'badge-percent', defaultTone: '2', labelVi: 'Thẻ', labelEn: 'Card', keywords: ['the', 'tin dung', 'card', 'atm'] }, // REVIEW
  { glyph: 'bank', iconName: 'bank', defaultTone: '2', labelVi: 'Ngân hàng', labelEn: 'Bank', keywords: ['ngan hang', 'bank', 'tai khoan'] }, // REVIEW
  { glyph: 'vault', iconName: 'shield', defaultTone: '6', labelVi: 'Két sắt', labelEn: 'Vault', keywords: ['ket sat', 'an toan', 'vault', 'bao mat'] }, // REVIEW
  { glyph: 'salary', iconName: 'briefcase', defaultTone: '4', labelVi: 'Lương', labelEn: 'Salary', keywords: ['luong', 'thu nhap', 'salary', 'cong viec'] }, // REVIEW
  { glyph: 'jar', iconName: 'piggy-bank', defaultTone: '3', labelVi: 'Hũ chi tiêu', labelEn: 'Spending Jar', keywords: ['hu chi tieu', 'jar', 'quy'] }, // REVIEW
];

const BASIC_GLYPH_MAP: Record<string, BasicGlyphDef> = Object.fromEntries(
  BASIC_GLYPHS.map((def) => [def.glyph, def]),
);

const SVG_ICONS = import.meta.glob('../assets/wallet-icons/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function walletSvgUrl(pkg: string, slug: string): string | undefined {
  const suffix = `/${pkg}/${slug}.svg`;
  for (const [key, url] of Object.entries(SVG_ICONS)) {
    if (key.replace(/\\/g, '/').endsWith(suffix)) {
      return url;
    }
  }
  return undefined;
}

export type WalletIconPackageId = 'basic' | 'bank' | 'ewallet' | 'save' | 'inv' | 'life' | 'fam';

export interface WalletIconEntry {
  id: string;
  packageId: WalletIconPackageId;
  labelVi: string;
  labelEn: string;
  keywords: readonly string[];
}

export interface WalletIconPackage {
  id: WalletIconPackageId;
  labelVi: string;
  labelEn: string;
  tabLabelVi: string;
  tabLabelEn: string;
  tabIcon: IconName;
  keywords: readonly string[];
  items: readonly WalletIconEntry[];
}

function buildBankEntries(): WalletIconEntry[] {
  const byId = new Map<string, BankApp>();
  for (const app of [...BANK_APPS.ios, ...BANK_APPS.android]) {
    const prev = byId.get(app.appId);
    if (!prev || app.monthlyInstall > prev.monthlyInstall) {
      byId.set(app.appId, app);
    }
  }
  // Keep vib-2 (MyVIB) as the single VIB entry in the picker; bank:vib still resolves via fallback.
  byId.delete('vib');

  return [...byId.values()]
    .sort((a, b) => b.monthlyInstall - a.monthlyInstall)
    .map((app) => {
      const label = app.bankShortName ?? app.appName;
      const keywords = [app.appId, app.appName, app.bankShortName, app.bankCode].filter(
        (v): v is string => Boolean(v),
      );
      return {
        id: `bank:${app.appId}`,
        packageId: 'bank',
        labelVi: label,
        labelEn: label,
        keywords,
      };
    });
}

function svgEntries(
  packageId: WalletIconPackageId,
  defs: readonly { id: string; labelVi: string; labelEn: string; keywords: readonly string[] }[],
): WalletIconEntry[] {
  return defs.map((d) => ({ ...d, packageId }));
}

export const WALLET_ICON_PACKAGES: readonly WalletIconPackage[] = [
  {
    id: 'basic',
    labelVi: 'Cơ bản', // REVIEW
    labelEn: 'Basic & Everyday',
    tabLabelVi: 'Cơ bản', // REVIEW
    tabLabelEn: 'Basic',
    tabIcon: 'wallet',
    keywords: ['co ban', 'basic', 'everyday', 'mac dinh'],
    items: BASIC_GLYPHS.map((def) => ({
      id: `basic:${def.glyph}:${def.defaultTone}`,
      packageId: 'basic',
      labelVi: def.labelVi,
      labelEn: def.labelEn,
      keywords: def.keywords,
    })),
  },
  {
    id: 'bank',
    labelVi: 'Ngân hàng Việt Nam', // REVIEW
    labelEn: 'Vietnam Banks',
    tabLabelVi: 'Ngân hàng', // REVIEW
    tabLabelEn: 'Banks',
    tabIcon: 'bank',
    keywords: ['ngan hang', 'viet nam', 'vietnam banks', 'bank', 'vietqr'],
    items: buildBankEntries(),
  },
  {
    id: 'ewallet',
    labelVi: 'Ví điện tử & Thanh toán', // REVIEW
    labelEn: 'E-Wallets & Payments',
    tabLabelVi: 'Ví ĐT', // REVIEW
    tabLabelEn: 'E-Wallets',
    tabIcon: 'smartphone',
    keywords: ['vi dien tu', 'thanh toan', 'ewallet', 'payment', 'pay'],
    items: svgEntries('ewallet', [
      { id: 'ewallet:momo', labelVi: 'MoMo', labelEn: 'MoMo', keywords: ['momo', 'vi momo'] },
      { id: 'ewallet:zalopay', labelVi: 'ZaloPay', labelEn: 'ZaloPay', keywords: ['zalopay', 'zalo'] },
      { id: 'ewallet:vnpay', labelVi: 'VNPay', labelEn: 'VNPay', keywords: ['vnpay', 'qr'] },
      { id: 'ewallet:shopeepay', labelVi: 'ShopeePay', labelEn: 'ShopeePay', keywords: ['shopeepay', 'shopee', 'airpay'] },
      { id: 'ewallet:viettel', labelVi: 'Viettel Money', labelEn: 'Viettel Money', keywords: ['viettel', 'viettelpay', 'viettel money'] },
      { id: 'ewallet:vnpt', labelVi: 'VNPT Money', labelEn: 'VNPT Money', keywords: ['vnpt', 'vnpt pay', 'vnpt money'] },
      { id: 'ewallet:applepay', labelVi: 'Apple Pay', labelEn: 'Apple Pay', keywords: ['apple', 'applepay', 'iphone'] },
      { id: 'ewallet:googlepay', labelVi: 'Google Pay', labelEn: 'Google Pay', keywords: ['google', 'googlepay', 'gpay'] },
      { id: 'ewallet:paypal', labelVi: 'PayPal', labelEn: 'PayPal', keywords: ['paypal', 'pp'] },
      { id: 'ewallet:wise', labelVi: 'Wise', labelEn: 'Wise', keywords: ['wise', 'transferwise'] },
      { id: 'ewallet:grabpay', labelVi: 'Grab / Moca', labelEn: 'Grab / Moca', keywords: ['grab', 'grabpay', 'moca'] },
      { id: 'ewallet:visa', labelVi: 'Visa', labelEn: 'Visa', keywords: ['visa', 'the quoc te', 'card'] },
      { id: 'ewallet:mc', labelVi: 'Mastercard', labelEn: 'Mastercard', keywords: ['mastercard', 'mc', 'the quoc te', 'card'] },
    ]),
  },
  {
    id: 'save',
    labelVi: 'Tiết kiệm & Mục tiêu', // REVIEW
    labelEn: 'Savings & Goals',
    tabLabelVi: 'Tiết kiệm', // REVIEW
    tabLabelEn: 'Savings',
    tabIcon: 'piggy-bank',
    keywords: ['tiet kiem', 'muc tieu', 'savings', 'goals'],
    items: svgEntries('save', [
      { id: 'save:piggy', labelVi: 'Heo đất', labelEn: 'Piggy Bank', keywords: ['heo dat', 'bo heo', 'piggy'] }, // REVIEW
      { id: 'save:emergency', labelVi: 'Quỹ dự phòng', labelEn: 'Emergency Fund', keywords: ['du phong', 'khan cap', 'emergency'] }, // REVIEW
      { id: 'save:house', labelVi: 'Mua nhà', labelEn: 'Buy a House', keywords: ['mua nha', 'nha cua', 'house'] }, // REVIEW
      { id: 'save:car', labelVi: 'Mua xe', labelEn: 'Buy a Car', keywords: ['mua xe', 'o to', 'car'] }, // REVIEW
      { id: 'save:edu', labelVi: 'Học tập', labelEn: 'Education', keywords: ['hoc tap', 'giao duc', 'hoc phi', 'edu'] }, // REVIEW
      { id: 'save:wedding', labelVi: 'Cưới hỏi', labelEn: 'Wedding', keywords: ['cuoi hoi', 'dam cuoi', 'wedding'] }, // REVIEW
      { id: 'save:retire', labelVi: 'Hưu trí', labelEn: 'Retirement', keywords: ['huu tri', 'nghi huu', 'retire'] }, // REVIEW
      { id: 'save:gift', labelVi: 'Lì xì / Quà', labelEn: 'Gift / Lucky Money', keywords: ['li xi', 'qua tang', 'gift'] }, // REVIEW
    ]),
  },
  {
    id: 'inv',
    labelVi: 'Đầu tư & Crypto', // REVIEW
    labelEn: 'Investments & Crypto',
    tabLabelVi: 'Đầu tư', // REVIEW
    tabLabelEn: 'Invest',
    tabIcon: 'trending-up',
    keywords: ['dau tu', 'chung khoan', 'crypto', 'investments', 'invest'],
    items: svgEntries('inv', [
      { id: 'inv:stocks', labelVi: 'Chứng khoán', labelEn: 'Stocks', keywords: ['chung khoan', 'co phieu', 'stocks'] }, // REVIEW
      { id: 'inv:fund', labelVi: 'Quỹ / ETF', labelEn: 'Funds / ETF', keywords: ['quy mo', 'etf', 'fund'] }, // REVIEW
      { id: 'inv:gold', labelVi: 'Vàng', labelEn: 'Gold', keywords: ['vang', 'sjc', 'gold'] }, // REVIEW
      { id: 'inv:crypto', labelVi: 'Crypto', labelEn: 'Crypto', keywords: ['crypto', 'tien ao', 'web3'] },
      { id: 'inv:usdt', labelVi: 'USDT', labelEn: 'USDT', keywords: ['usdt', 'tether', 'stablecoin'] },
      { id: 'inv:btc', labelVi: 'Bitcoin', labelEn: 'Bitcoin', keywords: ['btc', 'bitcoin'] },
      { id: 'inv:eth', labelVi: 'Ethereum', labelEn: 'Ethereum', keywords: ['eth', 'ethereum'] },
      { id: 'inv:binance', labelVi: 'Binance', labelEn: 'Binance', keywords: ['binance', 'bnb', 'san'] },
      { id: 'inv:okx', labelVi: 'OKX / Bybit', labelEn: 'OKX / Bybit', keywords: ['okx', 'bybit', 'san'] },
      { id: 'inv:forex', labelVi: 'Ngoại tệ', labelEn: 'Forex', keywords: ['ngoai te', 'forex', 'fx'] }, // REVIEW
    ]),
  },
  {
    id: 'life',
    labelVi: 'Du lịch & Đời sống', // REVIEW
    labelEn: 'Travel & Lifestyle',
    tabLabelVi: 'Đời sống', // REVIEW
    tabLabelEn: 'Lifestyle',
    tabIcon: 'coffee',
    keywords: ['du lich', 'doi song', 'travel', 'lifestyle'],
    items: svgEntries('life', [
      { id: 'life:travel', labelVi: 'Du lịch', labelEn: 'Travel', keywords: ['du lich', 'may bay', 'travel'] }, // REVIEW
      { id: 'life:luggage', labelVi: 'Công tác', labelEn: 'Business Trip', keywords: ['cong tac', 'vali', 'luggage'] }, // REVIEW
      { id: 'life:food', labelVi: 'Ăn uống', labelEn: 'Food & Dining', keywords: ['an uong', 'com', 'food'] }, // REVIEW
      { id: 'life:coffee', labelVi: 'Cà phê', labelEn: 'Coffee', keywords: ['ca phe', 'tra sua', 'coffee'] }, // REVIEW
      { id: 'life:sport', labelVi: 'Thể thao', labelEn: 'Sports', keywords: ['the thao', 'gym', 'sport'] }, // REVIEW
      { id: 'life:pet', labelVi: 'Thú cưng', labelEn: 'Pets', keywords: ['thu cung', 'cho meo', 'pet'] }, // REVIEW
    ]),
  },
  {
    id: 'fam',
    labelVi: 'Gia đình & Kinh doanh', // REVIEW
    labelEn: 'Family & Business',
    tabLabelVi: 'Gia đình', // REVIEW
    tabLabelEn: 'Family',
    tabIcon: 'home',
    keywords: ['gia dinh', 'kinh doanh', 'family', 'business'],
    items: [
      ...svgEntries('fam', [
        { id: 'fam:home', labelVi: 'Gia đình', labelEn: 'Family', keywords: ['gia dinh', 'nha', 'home', 'family'] }, // REVIEW
        { id: 'fam:couple', labelVi: 'Quỹ chung', labelEn: 'Shared Fund', keywords: ['quy chung', 'cap doi', 'couple'] }, // REVIEW
        { id: 'fam:baby', labelVi: 'Con cái', labelEn: 'Kids & Baby', keywords: ['con cai', 'em be', 'baby'] }, // REVIEW
      ]),
      ...svgEntries('fam', [
        { id: 'biz:shop', labelVi: 'Kinh doanh', labelEn: 'Shop & Business', keywords: ['kinh doanh', 'cua hang', 'shop', 'business'] }, // REVIEW
        { id: 'biz:freelance', labelVi: 'Freelance', labelEn: 'Freelance', keywords: ['freelance', 'lam tu do', 'du an'] },
        { id: 'biz:tax', labelVi: 'Thuế & Hóa đơn', labelEn: 'Tax & Invoices', keywords: ['thue', 'hoa don', 'tax', 'invoice'] }, // REVIEW
      ]),
    ],
  },
];

export function searchWalletIcons(query: string): WalletIconEntry[] {
  const q = foldForSearch(query.trim());
  if (q === '') {
    return WALLET_ICON_PACKAGES.flatMap((pkg) => pkg.items);
  }
  const results: WalletIconEntry[] = [];
  for (const pkg of WALLET_ICON_PACKAGES) {
    const pkgMatches =
      foldForSearch(pkg.labelVi).includes(q) ||
      foldForSearch(pkg.labelEn).includes(q) ||
      pkg.keywords.some((kw) => foldForSearch(kw).includes(q));
    if (pkgMatches) {
      results.push(...pkg.items);
      continue;
    }
    for (const item of pkg.items) {
      const itemMatches =
        foldForSearch(item.id).includes(q) ||
        foldForSearch(item.labelVi).includes(q) ||
        foldForSearch(item.labelEn).includes(q) ||
        item.keywords.some((kw) => foldForSearch(kw).includes(q));
      if (itemMatches) {
        results.push(item);
      }
    }
  }
  return results;
}

export type ResolvedWalletIcon =
  | {
      kind: 'basic';
      glyph: BasicWalletGlyph;
      tone: WalletPastelTone;
      iconName: IconName;
      toneClass: string;
    }
  | {
      kind: 'bank';
      appId: string;
      src: string;
    }
  | {
      kind: 'svg';
      packageId: string;
      slug: string;
      src: string;
    };

function isTone(val: string | undefined): val is WalletPastelTone {
  return val !== undefined && (WALLET_PASTEL_TONES as readonly string[]).includes(val);
}

function resolveBasic(glyphKey: string | undefined, toneKey: string | undefined): ResolvedWalletIcon {
  const def = (glyphKey ? BASIC_GLYPH_MAP[glyphKey] : undefined) ?? BASIC_GLYPHS[0]!;
  const tone: WalletPastelTone = isTone(toneKey) ? toneKey : def.defaultTone;
  return {
    kind: 'basic',
    glyph: def.glyph,
    tone,
    iconName: def.iconName,
    toneClass: TONE_CLASSES[tone],
  };
}

export function resolveWalletIcon(icon: string | null | undefined): ResolvedWalletIcon {
  if (!icon) {
    return resolveBasic('wallet', '5');
  }

  const legacyMatch = /^bg-avatar-([1-6])$/.exec(icon);
  if (legacyMatch) {
    return resolveBasic('wallet', legacyMatch[1]);
  }

  const parts = icon.split(':');
  const prefix = parts[0];

  if (prefix === 'basic') {
    return resolveBasic(parts[1], parts[2]);
  }

  if (prefix === 'bank' && parts[1]) {
    const src = bankAppLogo(parts[1]);
    if (src) {
      return { kind: 'bank', appId: parts[1], src };
    }
    return resolveBasic('bank', '2');
  }

  if (prefix && parts[1] && ['ewallet', 'save', 'inv', 'life', 'fam', 'biz'].includes(prefix)) {
    const src = walletSvgUrl(prefix, parts[1]);
    if (src) {
      return { kind: 'svg', packageId: prefix, slug: parts[1], src };
    }
  }

  return resolveBasic('wallet', '5');
}

export function walletIconClass(icon: string | null | undefined): string {
  const resolved = resolveWalletIcon(icon);
  if (resolved.kind === 'basic') {
    return resolved.toneClass;
  }
  return 'bg-card text-foreground border border-border';
}
