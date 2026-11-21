import type { JSX } from 'react';
import { formatMoney, type WalletDetailView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';
import { Pill } from '@cc/web-ui/components/Pill';
import { Card } from '@cc/web-ui/components/ui/card';
import { WalletIcon } from './WalletIcon';

/**
 * Wallet page header: the icon beside the balance at display size. With holdings, a
 * hairline-split footer shows cash and the total incl. assets side by side; a non-VND
 * wallet without holdings shows its VND cost basis under the balance.
 */
export function WalletSummary({
  wallet,
  withHoldings,
}: {
  wallet: WalletDetailView;
  withHoldings: boolean;
}): JSX.Element {
  const t = useT();
  const totalText = !withHoldings
    ? null
    : wallet.vndValue === null
      ? t('wallets.noRate')
      : wallet.currency === 'VND'
        ? formatMoney(wallet.vndValue, 'VND')
        : `≈ ${formatMoney(wallet.vndValue, 'VND')}`;
  const costText =
    withHoldings || wallet.currency === 'VND'
      ? null
      : wallet.vndValue !== null
        ? t('wallet.costBasis', { amount: formatMoney(wallet.vndValue, 'VND') })
        : t('wallets.noRate');

  return (
    <Card
      data-testid="wallet-summary"
      className="fsl-wallet__summary rounded-xl bg-card border border-border shadow-none ring-0 w-full text-card-foreground p-0 gap-0 overflow-hidden"
    >
      <div className="p-5 flex items-center gap-3.5">
        <WalletIcon icon={wallet.icon} size="lg" />
        <div className="min-w-0 flex flex-col gap-1">
          {(wallet.isDefault || wallet.archived) && (
            <div className="flex items-center gap-1.5">
              {wallet.isDefault && <Pill tone="neutral">{t('wallets.defaultBadge')}</Pill>}
              {wallet.archived && <Pill tone="neutral">{t('wallets.archived')}</Pill>}
            </div>
          )}
          <Amount
            value={wallet.balance}
            currency={wallet.currency}
            tone="neutral"
            size="xl"
            className="text-[clamp(1.75rem,9vw,2.5rem)] leading-none font-semibold tracking-[-0.02em]"
          />
          {costText && (
            <span data-testid="wallet-cost-basis" className="text-sm text-muted-foreground tabular-nums">
              {costText}
            </span>
          )}
        </div>
      </div>
      {totalText && (
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <div className="px-5 py-3 flex flex-col gap-0.5 min-w-0">
            <span className="text-xs text-muted-foreground">{t('wallet.cashRow')}</span>
            <Amount value={wallet.balance} currency={wallet.currency} tone="neutral" size="sm" className="font-semibold" />
          </div>
          <div className="px-5 py-3 flex flex-col gap-0.5 min-w-0">
            <span className="text-xs text-muted-foreground">{t('wallet.totalInclAssets')}</span>
            <span
              data-testid="wallet-cost-basis"
              className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap"
            >
              {totalText}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
