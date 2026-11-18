import type { JSX } from 'react';
import {
  assetQuantityLabel,
  formatMoney,
  type AssetView,
  type CurrencyCode,
  type HoldingView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';
import { cn } from '@cc/web-ui/lib/utils';

interface Item {
  id: string;
  name: string;
  meta: string;
  cost: number;
  share: number;
}

// Jade family only: holdings are not money in or out, so no Leaf / Lychee / Turmeric.
const FILL = ['fill-primary', 'fill-primary/60', 'fill-primary/35', 'fill-primary/20', 'fill-primary/10'];
const DOT = ['bg-primary', 'bg-primary/60', 'bg-primary/35', 'bg-primary/20', 'bg-primary/10'];
const tone = (list: string[], i: number): string => list[Math.min(i, list.length - 1)]!;

const SIZE = 208;
const OUTER = SIZE / 2;
const INNER = 74;

function polar(r: number, a: number): string {
  return `${OUTER + r * Math.cos(a)},${OUTER + r * Math.sin(a)}`;
}

/** One ring slice between angles a0..a1 (radians, 0 = 3 o'clock, clockwise). */
function arcPath(a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M${polar(OUTER, a0)}`,
    `A${OUTER},${OUTER} 0 ${large} 1 ${polar(OUTER, a1)}`,
    `L${polar(INNER, a1)}`,
    `A${INNER},${INNER} 0 ${large} 0 ${polar(INNER, a0)}`,
    'Z',
  ].join(' ');
}

/**
 * Holdings of an investment wallet: a half-ring of cost shares over the total,
 * then one row per asset (quantity, average price, cost, share). Sorted by cost.
 */
export function HoldingsPie({
  holdings,
  assetMap,
  currency,
  cash = 0,
}: {
  holdings: HoldingView[];
  assetMap: Map<string, AssetView>;
  currency: CurrencyCode;
  cash?: number;
}): JSX.Element {
  const t = useT();
  const holdingsCost = holdings.reduce((sum, h) => sum + (h.cost > 0 ? h.cost : 0), 0);
  const ringTotal = holdingsCost + Math.max(cash, 0);
  const centreTotal = holdingsCost + cash;
  const items: Item[] = [...holdings]
    .sort((a, b) => b.cost - a.cost)
    .map((h) => {
      const asset = assetMap.get(h.assetId);
      const qty = asset ? assetQuantityLabel(h.quantity, asset) : String(h.quantity);
      const avg =
        asset && h.quantity > 0
          ? t('wallet.holdingAvgPrice', {
              price: formatMoney(Math.round((h.cost * 10 ** asset.decimals) / h.quantity), currency),
              unit: asset.unit || asset.name,
            })
          : null;
      return {
        id: h.assetId,
        name: asset?.name ?? h.assetId,
        meta: avg ? `${qty} · ${avg}` : qty,
        cost: h.cost,
        share: ringTotal > 0 && h.cost > 0 ? Math.round((h.cost / ringTotal) * 100) : 0,
      };
    });
  const positive = items.filter((i) => i.cost > 0);
  const cashShare = ringTotal > 0 && cash > 0 ? Math.round((cash / ringTotal) * 100) : 0;
  const hasArc = ringTotal > 0;
  const ariaParts = [
    ...positive.map((i) => `${i.name} ${i.share}%`),
    ...(cash > 0 ? [`${t('wallet.cashRow')} ${cashShare}%`] : []),
  ];

  let a = Math.PI;
  return (
    <div data-testid="wallet-holdings-card" className="bg-card border border-border rounded-xl overflow-hidden">
      {hasArc && (
        <div className="flex flex-col items-center px-4 pt-5 pb-4">
          <div className="relative w-52 h-[104px] overflow-hidden">
            <svg
              data-testid="wallet-holdings-arc"
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="block w-52 h-52"
              role="img"
              aria-label={ariaParts.join(', ')}
            >
              {positive.map((item, idx) => {
                const a0 = a;
                a += (item.cost / ringTotal) * Math.PI;
                return (
                  <path
                    key={item.id}
                    data-testid="wallet-holdings-arc-slice"
                    d={arcPath(a0, a)}
                    className={cn(tone(FILL, idx), 'stroke-card')}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                );
              })}
              {cash > 0 && (() => {
                const a0 = a;
                a += (cash / ringTotal) * Math.PI;
                return (
                  <path
                    key="cash"
                    data-testid="wallet-holdings-arc-slice"
                    d={arcPath(a0, a)}
                    className="fill-muted-foreground/30 stroke-card"
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                );
              })()}
            </svg>
            <div className="absolute inset-x-0 bottom-0 flex justify-center">
              <Amount value={centreTotal} currency={currency} tone="neutral" size="lg" className="font-semibold leading-tight" />
            </div>
          </div>
          <span className="mt-1 text-xs text-muted-foreground tabular-nums">
            {cash !== 0
              ? t('wallet.holdingsTotalWithCash', { count: items.length })
              : t('wallet.holdingsTotal', { count: items.length })}
          </span>
        </div>
      )}
      <div data-testid="wallet-holdings-list" className={cn('divide-y divide-border', hasArc && 'border-t border-border')}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            data-testid={`wallet-holding-${item.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 min-h-14"
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span
                aria-hidden="true"
                className={cn('mt-1.5 inline-block size-2.5 rounded-full shrink-0', item.cost > 0 ? tone(DOT, idx) : 'bg-muted')}
              />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground break-words">{item.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums break-words">{item.meta}</span>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-0.5">
              <Amount value={item.cost} currency={currency} tone="neutral" size="sm" />
              <span className="text-sm text-muted-foreground tabular-nums">{item.share}%</span>
            </div>
          </div>
        ))}
        {cash !== 0 && (
          <div
            data-testid="wallet-holding-cash"
            className="flex items-center justify-between gap-3 px-4 py-3 min-h-14"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 rounded-full shrink-0 bg-muted-foreground/30"
              />
              <span className="text-sm font-semibold text-foreground break-words">
                {t('wallet.cashRow')}
              </span>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-0.5">
              <Amount value={cash} currency={currency} tone="neutral" size="sm" />
              {cash > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">{cashShare}%</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
