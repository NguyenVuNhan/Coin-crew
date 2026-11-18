import type { JSX } from 'react';
import type { CurrencyCode } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';
import { cn } from '@cc/web-ui/lib/utils';

export interface WalletPieSlice {
  id: string;
  name: string;
  vndValue: number;
  approximate?: boolean;
  subtitle?: string;
}

const FILL_CLASSES = [
  'fill-primary/100',
  'fill-primary/70',
  'fill-primary/45',
  'fill-primary/25',
  'fill-primary/15',
] as const;

const SWATCH_CLASSES = [
  'bg-primary/100',
  'bg-primary/70',
  'bg-primary/45',
  'bg-primary/25',
  'bg-primary/15',
] as const;

/**
 * Computes up to 4 positive slices sorted descending by `vndValue`, grouping any remainder into an "Other" slice.
 */
export function buildPieSlices(
  slices: WalletPieSlice[],
  otherLabel: string,
): WalletPieSlice[] {
  const positive = slices
    .filter((s) => Number.isFinite(s.vndValue) && s.vndValue > 0)
    .sort((a, b) => b.vndValue - a.vndValue);

  if (positive.length <= 4) return positive;

  const top = positive.slice(0, 4);
  const rest = positive.slice(4);
  const restSum = rest.reduce((sum, s) => sum + s.vndValue, 0);
  if (restSum > 0) {
    top.push({
      id: 'other',
      name: otherLabel,
      vndValue: restSum,
      approximate: rest.some((s) => s.approximate) || undefined,
    });
  }
  return top;
}

function sectorPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

/**
 * Plain SVG pie chart showing wallet distribution in theme accent tints, with a legend showing each slice's
 * colour dot, name, VND amount (prefixed with "≈" when approximate), and rounded percentage share.
 */
export function WalletPie({
  slices,
  currency = 'VND',
  ariaLabelPrefix,
  showAmounts = true,
}: {
  slices: WalletPieSlice[];
  currency?: CurrencyCode;
  ariaLabelPrefix?: string;
  showAmounts?: boolean;
}): JSX.Element | null {
  const t = useT();
  const displaySlices = buildPieSlices(slices, t('wallets.other'));
  if (displaySlices.length === 0) return null;

  const total = displaySlices.reduce((sum, s) => sum + s.vndValue, 0);
  if (total <= 0) return null;

  const cx = 40;
  const cy = 40;
  const r = 36;
  const orderText = displaySlices.map((s) => s.name).join(', ');
  const ariaLabel = `${ariaLabelPrefix ?? t('wallets.whereMoneyIs')}: ${orderText}`;

  let angle = -Math.PI / 2;

  return (
    <div
      data-testid="wallet-pie"
      className="fsl-wallet-pie flex items-center gap-4 w-full pt-2"
    >
      <svg
        viewBox="0 0 80 80"
        width={80}
        height={80}
        role="img"
        aria-label={ariaLabel}
        className="fsl-wallet-pie__svg shrink-0"
      >
        {displaySlices.length === 1 ? (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            data-slice-id={displaySlices[0]!.id}
            className={cn('fsl-wallet-pie__slice', FILL_CLASSES[0])}
          />
        ) : (
          displaySlices.map((slice, idx) => {
            const sweep = (slice.vndValue / total) * Math.PI * 2;
            const start = angle;
            const end = angle + sweep;
            angle = end;
            return (
              <path
                key={slice.id}
                d={sectorPath(cx, cy, r, start, end)}
                data-slice-id={slice.id}
                className={cn('fsl-wallet-pie__slice', FILL_CLASSES[idx] ?? FILL_CLASSES[4])}
              />
            );
          })
        )}
      </svg>

      <ul className="fsl-wallet-pie__legend flex flex-col gap-1.5 min-w-0 flex-1 m-0 p-0 list-none">
        {displaySlices.map((slice, idx) => {
          const share =
            total > 0 && Number.isFinite(slice.vndValue) && slice.vndValue > 0
              ? Math.round((slice.vndValue / total) * 100)
              : 0;
          return (
            <li
              key={slice.id}
              className="fsl-wallet-pie__row flex items-center justify-between gap-2 min-w-0 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block size-2.5 rounded-full shrink-0',
                    SWATCH_CLASSES[idx] ?? SWATCH_CLASSES[4],
                  )}
                />
                <span className="flex flex-col min-w-0">
                  <span className={showAmounts ? 'truncate' : 'break-words'}>{slice.name}</span>
                  {showAmounts && slice.subtitle && (
                    <span className="text-xs text-muted-foreground tabular-nums truncate">
                      {slice.subtitle}
                    </span>
                  )}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
                {showAmounts && (
                  <Amount value={slice.vndValue} currency={currency} approximate={slice.approximate} size="sm" />
                )}
                <span className="text-xs text-muted-foreground">{share}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
