import type { JSX } from 'react';
import { CURRENCIES, type CurrencyCode } from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';

const CURRENCY_SVGS = import.meta.glob('../assets/currency-icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const BADGE_TO_SLUG: Record<string, string> = {
  '₫': 'vnd',
  $: 'usd',
  '₮': 'usdt',
  $C: 'usdc',
  '€': 'eur',
  '¥': 'jpy',
  '£': 'gbp',
  S$: 'sgd',
  A$: 'aud',
  '₩': 'krw',
  '฿': 'thb',
  NT$: 'twd',
  HK$: 'hkd',
  RM: 'myr',
  Rp: 'idr',
  '₱': 'php',
  '₹': 'inr',
  NZ$: 'nzd',
  '៛': 'khr',
  '₭': 'lak',
  K: 'mmk',
  B$: 'bnd',
  P: 'mop',
  '₨': 'pkr',
  '৳': 'bdt',
  Rs: 'lkr',
  C$: 'cad',
  Fr: 'chf',
  kr: 'kr',
  'zł': 'pln',
  'Kč': 'czk',
  Ft: 'huf',
  lei: 'ron',
  '₽': 'rub',
  '₴': 'uah',
  '₺': 'try',
  R$: 'brl',
  M$: 'mxn',
  CL$: 'clp',
  CO$: 'cop',
  'د.إ': 'aed',
  '﷼': 'sar',
  QR: 'qar',
  '₪': 'ils',
  R: 'zar',
  'E£': 'egp',
  '₦': 'ngn',
  '◈': 'dai',
  '€C': 'eurc',
};

function currencySvgUrl(code: CurrencyCode): string | undefined {
  const badge = CURRENCIES[code].badge;
  const slug = BADGE_TO_SLUG[badge];
  if (!slug) return undefined;
  const suffix = `/${slug}.svg`;
  for (const [key, url] of Object.entries(CURRENCY_SVGS)) {
    if (key.replace(/\\/g, '/').endsWith(suffix)) {
      return url;
    }
  }
  return undefined;
}

export interface CurrencyBadgeProps {
  code: CurrencyCode;
  selected?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function CurrencyBadge({
  code,
  selected = false,
  size = 'md',
  className,
}: CurrencyBadgeProps): JSX.Element {
  const src = currencySvgUrl(code);

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid place-items-center shrink-0',
        size === 'sm' ? 'size-8 rounded-lg' : 'size-9 rounded-xl',
        selected ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground',
        className,
      )}
    >
      {src && (
        <img
          src={src}
          alt=""
          className={cn('object-contain', size === 'sm' ? 'size-5' : 'size-6')}
        />
      )}
    </span>
  );
}
