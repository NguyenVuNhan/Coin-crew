import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatMoney, type CurrencyCode, type WalletDetailView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { currentMonthLocal } from '@cc/web-util/localDate';
import { useMe } from '@cc/web-data-access/hooks';
import { useLedger } from '@cc/web-data-access/people';
import {
  usePersonalSummary,
  useReorderWallets,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { Amount } from '@cc/web-ui/components/Amount';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Pill } from '@cc/web-ui/components/Pill';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Card } from '@cc/web-ui/components/ui/card';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { WalletForm, walletIconClass } from '../components/WalletForm';
import { BalanceCheckPrompt } from '../components/BalanceCheckPrompt';

function computePerCurrency(wallets: WalletDetailView[]): { currency: CurrencyCode; balance: number }[] {
  const map = new Map<CurrencyCode, number>();
  for (const w of wallets) {
    if (w.archived) continue;
    map.set(w.currency, (map.get(w.currency) ?? 0) + w.balance);
  }
  return Array.from(map.entries()).map(([currency, balance]) => ({ currency, balance }));
}

function WalletRow({
  wallet,
  reordering,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  wallet: WalletDetailView;
  reordering: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}): JSX.Element {
  const t = useT();
  const kindLabel = wallet.kind === 'investment' ? t('wallets.investment') : t('wallets.everyday');
  const noRate = wallet.currency !== 'VND' && wallet.vndValue === null;

  const content = (
    <>
      <div
        className={cn(
          'size-10 rounded-xl grid place-items-center shrink-0',
          walletIconClass(wallet.icon),
        )}
      >
        <Icon name="wallet" size={18} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">{wallet.name}</span>
          {wallet.isDefault && <Pill tone="neutral">{t('wallets.defaultBadge')}</Pill>}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>{`${kindLabel} · ${wallet.currency}`}</span>
          {noRate && <span>· {t('wallets.noRate')}</span>}
        </div>
      </div>
      <Amount value={wallet.balance} currency={wallet.currency} tone="neutral" />
    </>
  );

  if (reordering) {
    return (
      <div
        data-testid={`wallet-row-${wallet.id}`}
        className="fsl-wallets__row flex items-center gap-3 min-h-14 px-4 py-3"
      >
        {content}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={!canMoveUp}
            aria-label={`${t('wallets.moveUp')} ${wallet.name}`}
            data-testid={`wallet-move-up-${wallet.id}`}
            onClick={onMoveUp}
            className="size-9 rounded-lg border border-border bg-card grid place-items-center text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Icon name="chevronUp" size={16} />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            aria-label={`${t('wallets.moveDown')} ${wallet.name}`}
            data-testid={`wallet-move-down-${wallet.id}`}
            onClick={onMoveDown}
            className="size-9 rounded-lg border border-border bg-card grid place-items-center text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Icon name="chevronDown" size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={`/wallets/${wallet.id}`}
      data-testid={`wallet-row-${wallet.id}`}
      className="fsl-wallets__row flex items-center gap-3 min-h-14 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none"
    >
      {content}
      <Icon name="chevronRight" className="text-muted-foreground shrink-0" />
    </Link>
  );
}

export function WalletsScreen(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const meQuery = useMe();
  const user = meQuery.data?.user;
  const { ledger } = useLedger();

  const walletsQuery = useWalletDetails();
  const list = walletsQuery.data?.wallets ?? [];
  const hasAny = list.length > 0;
  const currentMonth = currentMonthLocal();
  const summary = usePersonalSummary(currentMonth, { enabled: hasAny });
  const reorder = useReorderWallets();

  const [addOpen, setAddOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  const everyday = sorted.filter((w) => !w.archived && w.kind === 'everyday');
  const investment = sorted.filter((w) => !w.archived && w.kind === 'investment');
  const archived = sorted.filter((w) => w.archived);
  const activeCount = everyday.length + investment.length;

  const fallbackTotal = sorted
    .filter((w) => !w.archived)
    .reduce((sum, w) => sum + (w.vndValue ?? (w.currency === 'VND' ? w.balance : 0)), 0);
  const fallbackCash = sorted
    .filter((w) => !w.archived)
    .reduce((sum, w) => sum + (w.currency === 'VND' ? w.balance : (w.vndValue ?? 0)), 0);
  const totalVnd = summary.data ? summary.data.totalVnd : fallbackTotal;
  const cashVnd = summary.data ? (summary.data.cashVnd ?? summary.data.totalVnd) : fallbackCash;
  const approximate = summary.data ? summary.data.approximate : false;
  const perCurrency = summary.data ? summary.data.perCurrency : computePerCurrency(sorted);

  const handleMove = (group: WalletDetailView[], index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= group.length) return;
    const nextGroup = [...group];
    const [moved] = nextGroup.splice(index, 1);
    nextGroup.splice(targetIndex, 0, moved!);

    const nextIds =
      group[0]?.kind === 'investment'
        ? [...everyday.map((w) => w.id), ...nextGroup.map((w) => w.id), ...archived.map((w) => w.id)]
        : [...nextGroup.map((w) => w.id), ...investment.map((w) => w.id), ...archived.map((w) => w.id)];

    reorder.mutate(nextIds);
  };

  return (
    <Screen
      title={t('wallets.title')}
      back="/trips"
      right={
        activeCount >= 2 ? (
          <Button
            variant="ghost"
            data-testid="wallets-reorder-toggle"
            onClick={() => setReordering((v) => !v)}
          >
            {reordering ? t('wallets.done') : t('wallets.reorder')}
          </Button>
        ) : undefined
      }
      nav={
        ledger
          ? { section: 'home', addHref: `/t/${ledger.tripId}/expenses/new` }
          : undefined
      }
    >
      <div className="fsl-wallets flex flex-col gap-4 py-4">
        {walletsQuery.isPending ? (
          <SkeletonList rows={3} />
        ) : walletsQuery.error ? (
          <InlineError error={walletsQuery.error} onRetry={() => walletsQuery.refetch()} />
        ) : !hasAny ? (
          <EmptyState
            icon="wallet"
            title={t('wallets.emptyTitle')}
            body={t('wallets.emptyBody')}
            action={
              <Button
                variant="secondary"
                data-testid="wallets-add"
                onClick={() => setAddOpen(true)}
              >
                {t('wallets.add')}
              </Button>
            }
          />
        ) : (
          <>
            <BalanceCheckPrompt />
            <Card
              data-testid="wallets-total"
              className="fsl-wallets__total rounded-xl bg-card p-5 border border-border shadow-none ring-0 flex flex-col items-start gap-2 w-full text-card-foreground"
            >
              <div className="flex flex-col items-start gap-0.5">
                <Amount value={cashVnd} approximate={approximate} tone="neutral" size="xl" />
                {totalVnd !== cashVnd && (
                  <p
                    data-testid="wallets-total-with-assets"
                    className="m-0 text-sm text-muted-foreground tabular-nums"
                  >
                    {t('wallets.totalWithAssets', { total: formatMoney(totalVnd, 'VND') })}
                  </p>
                )}
              </div>
              {perCurrency.length > 0 && (
                <div
                  data-testid="wallets-per-currency"
                  className="flex flex-col gap-0.5 text-sm text-foreground"
                >
                  {perCurrency.map((row) => (
                    <Amount
                      key={row.currency}
                      value={row.balance}
                      currency={row.currency}
                      tone="neutral"
                      size="sm"
                    />
                  ))}
                </div>
              )}
            </Card>

            {everyday.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                  {t('wallets.everyday')}
                </h2>
                <div
                  data-testid="wallets-group-everyday"
                  className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden"
                >
                  {everyday.map((w, i) => (
                    <WalletRow
                      key={w.id}
                      wallet={w}
                      reordering={reordering}
                      canMoveUp={i > 0}
                      canMoveDown={i < everyday.length - 1}
                      onMoveUp={() => handleMove(everyday, i, -1)}
                      onMoveDown={() => handleMove(everyday, i, 1)}
                    />
                  ))}
                </div>
              </section>
            )}

            {investment.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                  {t('wallets.investment')}
                </h2>
                <div
                  data-testid="wallets-group-investment"
                  className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden"
                >
                  {investment.map((w, i) => (
                    <WalletRow
                      key={w.id}
                      wallet={w}
                      reordering={reordering}
                      canMoveUp={i > 0}
                      canMoveDown={i < investment.length - 1}
                      onMoveUp={() => handleMove(investment, i, -1)}
                      onMoveDown={() => handleMove(investment, i, 1)}
                    />
                  ))}
                </div>
              </section>
            )}

            {archived.length > 0 && (
              <section
                data-testid="wallets-group-archived"
                className="flex flex-col gap-2"
              >
                <button
                  type="button"
                  data-testid="wallets-archived-toggle"
                  aria-expanded={archivedOpen}
                  onClick={() => setArchivedOpen((v) => !v)}
                  className="flex items-center justify-between min-h-11 px-1 text-sm font-semibold text-muted-foreground cursor-pointer"
                >
                  <span>{`${t('wallets.archived')} (${archived.length})`}</span>
                  <Icon name={archivedOpen ? 'chevronUp' : 'chevronDown'} size={18} />
                </button>
                {archivedOpen && (
                  <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                    {archived.map((w) => (
                      <WalletRow
                        key={w.id}
                        wallet={w}
                        reordering={false}
                        canMoveUp={false}
                        canMoveDown={false}
                        onMoveUp={() => undefined}
                        onMoveDown={() => undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {reorder.error && <InlineError error={reorder.error} />}

            <Button
              variant="secondary"
              block
              data-testid="wallets-add"
              onClick={() => setAddOpen(true)}
            >
              {t('wallets.add')}
            </Button>
          </>
        )}
      </div>

      <WalletForm open={addOpen} onClose={() => setAddOpen(false)} />
    </Screen>
  );
}
