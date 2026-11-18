import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { currentMonthLocal } from '@cc/web-util/localDate';
import { useT } from '@cc/web-i18n';
import { useMe } from '@cc/web-data-access/hooks';
import { useLedger } from '@cc/web-data-access/people';
import {
  useAssets,
  useCategories,
  useDeleteWallet,
  useHoldings,
  usePersonalList,
  useUpdateWallet,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import type { RowAction } from '@cc/web-ui/components/ActionRow';
import { ActionSheet } from '@cc/web-ui/components/ActionSheet';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Screen } from '../components/Screen';
import { TransactionRow } from '../components/TransactionRow';
import { WalletForm } from '../components/WalletForm';
import { HoldingsPie } from '../components/HoldingsPie';
import { WalletSummary } from '../components/WalletSummary';

export function WalletScreen(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const navigate = useNavigate();
  const meQuery = useMe();
  const user = meQuery.data?.user;
  const { ledger } = useLedger();

  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const wallet = walletsQuery.data?.wallets.find((w) => w.id === id);
  const isInvestment = wallet?.kind === 'investment';
  const assetsQuery = useAssets({ enabled: isInvestment });
  const holdingsQuery = useHoldings(id, { enabled: Boolean(isInvestment && id) });

  const currentMonth = currentMonthLocal();
  const listQuery = usePersonalList(
    { month: currentMonth, walletId: id },
    { enabled: Boolean(wallet && id) },
  );

  const updateWallet = useUpdateWallet();
  const deleteWallet = useDeleteWallet();

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  const actions: RowAction[] = [];
  if (wallet) {
    actions.push({
      id: 'edit',
      label: t('wallet.edit'),
      icon: 'edit',
      onSelect: () => setEditOpen(true),
    });
    if (!wallet.isDefault && !wallet.archived) {
      actions.push({
        id: 'makeDefault',
        label: t('wallet.makeDefault'),
        icon: 'star',
        onSelect: () => updateWallet.mutate({ id: wallet.id, input: { isDefault: true } }),
      });
    }
    if (!wallet.archived && !wallet.isDefault) {
      actions.push({
        id: 'archive',
        label: t('wallet.archive'),
        icon: 'ban',
        onSelect: () => updateWallet.mutate({ id: wallet.id, input: { archived: true } }),
      });
    }
    if (wallet.archived) {
      actions.push({
        id: 'restore',
        label: t('wallet.restore'),
        icon: 'rotateCcw',
        onSelect: () => updateWallet.mutate({ id: wallet.id, input: { archived: false } }),
      });
    }
    if (wallet.entryCount === 0) {
      actions.push({
        id: 'delete',
        label: t('wallet.delete'),
        icon: 'trash',
        tone: 'danger',
        onSelect: () => setConfirmDeleteOpen(true),
      });
    }
  }

  const mutationError = updateWallet.error ?? deleteWallet.error;
  const rows = listQuery.data?.rows ?? [];
  const assets = assetsQuery.data?.assets ?? [];
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const holdings = holdingsQuery.data?.holdings ?? [];

  return (
    <Screen
      title={wallet?.name ?? t('wallets.title')}
      back="/wallets"
      right={
        wallet ? (
          <button
            type="button"
            aria-label={t('wallet.actions')}
            data-testid="wallet-menu-btn"
            onClick={() => setMenuOpen(true)}
            className="size-11 grid place-items-center rounded-full text-foreground hover:bg-muted cursor-pointer"
          >
            <Icon name="ellipsisVertical" size={20} />
          </button>
        ) : undefined
      }
      nav={
        ledger
          ? { section: 'home', addHref: `/t/${ledger.tripId}/expenses/new` }
          : undefined
      }
    >
      <div className="fsl-wallet flex flex-col gap-4 py-4">
        {walletsQuery.isPending ? (
          <SkeletonList rows={3} />
        ) : walletsQuery.error ? (
          <InlineError error={walletsQuery.error} onRetry={() => walletsQuery.refetch()} />
        ) : !wallet ? (
          <EmptyState icon="wallet" title={t('wallet.notFound')} body="" />
        ) : (
          <>
            <WalletSummary wallet={wallet} withHoldings={Boolean(isInvestment && holdings.length > 0)} />

            {mutationError && <InlineError error={mutationError} />}

            {isInvestment && (
              <section data-testid="wallet-holdings" className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5 px-1">
                <h2 className="m-0 text-sm font-semibold text-muted-foreground">{t('wallet.holdings')}</h2>
                <p className="m-0 text-xs text-muted-foreground">{t('wallet.holdingsSubtitle')}</p>
              </div>
              {holdingsQuery.isPending ? (
                <SkeletonList rows={2} />
              ) : holdingsQuery.error ? (
                <InlineError error={holdingsQuery.error} onRetry={() => holdingsQuery.refetch()} />
              ) : holdings.length === 0 ? (
                <p className="m-0 px-1 text-sm text-muted-foreground">{t('wallet.noHoldings')}</p>
              ) : (
                <HoldingsPie holdings={holdings} assetMap={assetMap} currency={wallet.currency} cash={wallet.balance} />
              )}
            </section>
            )}

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="m-0 text-sm font-semibold text-muted-foreground">
                  {t('wallet.entriesThisMonth')}
                </h2>
                <Link
                  to={`/transactions?walletId=${encodeURIComponent(wallet.id)}`}
                  data-testid="wallet-see-all"
                  className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline"
                >
                  <span>{t('wallet.seeAll')}</span>
                  <Icon name="chevronRight" size={16} />
                </Link>
              </div>

              {listQuery.isPending ? (
                <SkeletonList rows={2} />
              ) : listQuery.error ? (
                <InlineError error={listQuery.error} onRetry={() => listQuery.refetch()} />
              ) : rows.length === 0 ? (
                <p className="m-0 px-1 text-sm text-muted-foreground">{t('wallet.noEntries')}</p>
              ) : (
                <div
                  data-testid="wallet-entries"
                  className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden"
                >
                  {rows.map((row) => (
                    <TransactionRow
                      key={row.kind === 'entry' ? row.entry.id : row.id}
                      row={row}
                      wallets={walletsQuery.data?.wallets ?? []}
                      categories={categoriesQuery.data?.categories ?? []}
                      assets={assets}
                    />
                  ))}
                </div>
              )}
            </section>

            <ActionSheet
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              title={t('wallet.actions')}
              actions={actions}
            />

            <WalletForm
              open={editOpen}
              onClose={() => setEditOpen(false)}
              wallet={wallet}
            />

            <Modal
              open={confirmDeleteOpen}
              onClose={() => setConfirmDeleteOpen(false)}
              title={t('wallet.deleteConfirmTitle')}
            >
              <div className="flex flex-col gap-4">
                <p className="m-0 text-sm text-muted-foreground">
                  {t('wallet.deleteConfirmBody', { name: wallet.name })}
                </p>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDeleteOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="danger"
                    data-testid="wallet-delete-confirm"
                    loading={deleteWallet.isPending}
                    onClick={() => {
                      deleteWallet.mutate(wallet.id, {
                        onSuccess: () => {
                          setConfirmDeleteOpen(false);
                          navigate('/wallets', { replace: true });
                        },
                      });
                    }}
                  >
                    {t('wallet.delete')}
                  </Button>
                </div>
              </div>
            </Modal>
          </>
        )}
      </div>
    </Screen>
  );
}
