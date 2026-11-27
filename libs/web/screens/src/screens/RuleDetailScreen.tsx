import { useEffect, useMemo, useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  type AssetView,
  type CategoryView,
  type RecurringDraft,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import {
  useAssets,
  useCategories,
  usePersonalList,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import {
  useDeleteRule,
  usePauseRule,
  useRecurringRules,
  useResumeRule,
} from '@cc/web-data-access/recurring';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { cn } from '@cc/web-ui/lib/utils';
import {
  draftCurrency,
  draftTitle,
  pausedReasonLabel,
  signedMoneyParts,
} from '../components/PlannedItemCard';
import { Screen } from '../components/Screen';
import { TransactionRow } from '../components/TransactionRow';
import {
  formatDayMonth,
  scheduleInWords,
  type TranslateFn,
} from '../lib/scheduleWords';

function shortTypeLabel(type: RecurringDraft['type'], t: TranslateFn): string {
  switch (type) {
    case 'income':
      return t('recurring.typeShortIncome');
    case 'transfer':
      return t('recurring.typeShortTransfer');
    case 'buy':
      return t('recurring.typeShortBuy');
    default:
      return t('recurring.typeShortExpense');
  }
}

export function RuleDetailScreen(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();

  const rulesQuery = useRecurringRules();
  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const assetsQuery = useAssets();
  const txListQuery = usePersonalList({ rule: id }, { enabled: Boolean(id) });

  const pauseRule = usePauseRule();
  const resumeRule = useResumeRule();
  const deleteRule = useDeleteRule();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const wallets = walletsQuery.data?.wallets ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const assets = assetsQuery.data?.assets ?? [];

  const walletsById = useMemo(() => {
    const map = new Map<string, WalletDetailView>();
    for (const w of wallets) map.set(w.id, w);
    return map;
  }, [wallets]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryView>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const assetsById = useMemo(() => {
    const map = new Map<string, AssetView>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  const rule = useMemo(
    () => (id ? (rulesQuery.data?.rules.find((r) => r.id === id) ?? null) : null),
    [rulesQuery.data?.rules, id],
  );

  const recordedRows = useMemo(
    () => (txListQuery.data?.rows ?? []).slice(0, 10),
    [txListQuery.data?.rows],
  );

  const name = rule ? draftTitle(rule.draft, categoriesById, assetsById, t) : t('recurring.title');
  const currency = rule ? draftCurrency(rule.draft, walletsById) : 'VND';
  const money = rule ? signedMoneyParts(rule.draft, currency, false) : null;
  const scheduleText = rule ? scheduleInWords(rule.schedule, t) : '';
  const isPaused = rule?.status === 'paused';
  const isEnded = rule?.status === 'ended';

  const walletLabel = useMemo(() => {
    if (!rule) return '';
    const from = walletsById.get(rule.draft.walletId)?.name ?? '';
    if (rule.draft.type === 'transfer' && rule.draft.toWalletId) {
      const to = walletsById.get(rule.draft.toWalletId)?.name ?? '';
      if (from && to) return `${from} \u2192 ${to}`;
    }
    return from;
  }, [rule, walletsById]);

  const activeSummaryLine = useMemo(() => {
    if (!rule) return '';
    const parts: string[] = [];
    if (rule.nextDueOn) {
      parts.push(t('recurring.detailNextDue', { date: formatDayMonth(rule.nextDueOn) }));
    }
    if (walletLabel) {
      parts.push(walletLabel);
    }
    if (rule.lastConfirmedOn) {
      parts.push(t('recurring.detailConfirmed', { date: formatDayMonth(rule.lastConfirmedOn) }));
    }
    return parts.join(' · ');
  }, [rule, walletLabel, t]);

  const busy = pauseRule.isPending || resumeRule.isPending || deleteRule.isPending;

  const handlePause = async () => {
    if (!rule) return;
    setActionError(null);
    try {
      await pauseRule.mutateAsync(rule.id);
      setToast(t('recurring.toastPaused', { name }));
    } catch (err) {
      setActionError(err);
    }
  };

  const handleResume = async () => {
    if (!rule) return;
    setActionError(null);
    try {
      await resumeRule.mutateAsync(rule.id);
      setToast(t('recurring.toastResumed', { name }));
    } catch (err) {
      setActionError(err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!rule) return;
    setActionError(null);
    try {
      await deleteRule.mutateAsync(rule.id);
      setDeleteOpen(false);
      navigate('/recurring', { replace: true });
    } catch (err) {
      setActionError(err);
    }
  };

  return (
    <Screen
      title={name}
      back="/recurring"
      right={
        rule ? (
          <Button
            variant="ghost"
            href={`/recurring/${encodeURIComponent(rule.id)}/edit`}
            data-testid="rule-edit"
            aria-label={t('recurring.edit')}
            title={t('recurring.edit')}
            className="size-11 p-0"
          >
            <Icon name="edit" size={20} />
          </Button>
        ) : undefined
      }
    >
      <div className="fsl-rule-detail flex flex-col gap-4">
        {rulesQuery.isPending && !rule ? (
          <SkeletonList rows={3} />
        ) : rulesQuery.error && !rule ? (
          <InlineError error={rulesQuery.error} onRetry={() => void rulesQuery.refetch()} />
        ) : !rule || !money ? (
          <div data-testid="rule-not-found">
            <EmptyState
              icon="repeat"
              title={t('recurring.notFoundTitle')}
              body={t('recurring.notFoundBody')}
              action={
                <Button variant="primary" block href="/recurring">
                  {t('recurring.title')}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div
              data-testid="rule-summary-card"
              className="rounded-xl bg-card border border-border p-5 flex flex-col gap-1.5"
            >
              <div className="text-sm font-medium text-muted-foreground">
                {`${shortTypeLabel(rule.draft.type, t)} · ${scheduleText}`}
              </div>
              <div
                data-testid="rule-summary-amount"
                className={cn('text-3xl font-bold tabular-nums leading-tight', money.className)}
              >
                {money.text}
              </div>
              {isPaused ? (
                <div
                  data-testid="rule-status-line"
                  className="text-xs font-medium text-warning-foreground leading-snug"
                >
                  {t('recurring.rulePausedMeta', {
                    reason: pausedReasonLabel(rule.pausedReason, t),
                  })}
                </div>
              ) : activeSummaryLine ? (
                <div
                  data-testid="rule-status-line"
                  className="text-xs text-muted-foreground leading-snug"
                >
                  {activeSummaryLine}
                </div>
              ) : null}
            </div>

            <section
              data-testid="rule-recorded"
              className="fsl-rule-detail__recorded flex flex-col gap-2"
            >
              <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                {t('recurring.recordedHeading')}
              </h2>
              {txListQuery.isPending ? (
                <SkeletonList rows={2} />
              ) : txListQuery.error ? (
                <InlineError
                  error={txListQuery.error}
                  onRetry={() => void txListQuery.refetch()}
                />
              ) : recordedRows.length === 0 ? (
                <div
                  data-testid="rule-recorded-empty"
                  className="rounded-xl bg-card px-4 py-4 text-sm text-muted-foreground"
                >
                  {t('recurring.recordedEmpty')}
                </div>
              ) : (
                <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
                  {recordedRows.map((row) => (
                    <TransactionRow
                      key={row.kind === 'entry' ? row.entry.id : `person-${row.id}`}
                      row={row}
                      wallets={wallets}
                      categories={categories}
                      assets={assets}
                      showDate
                    />
                  ))}
                </div>
              )}
            </section>

            {actionError !== null && <InlineError error={actionError} />}

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {!isEnded &&
                  (isPaused ? (
                    <Button
                      type="button"
                      variant="secondary"
                      data-testid="rule-resume"
                      disabled={busy}
                      loading={resumeRule.isPending}
                      onClick={() => void handleResume()}
                      className="flex-1 min-h-11"
                    >
                      {t('recurring.resume')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      data-testid="rule-pause"
                      disabled={busy}
                      loading={pauseRule.isPending}
                      onClick={() => void handlePause()}
                      className="flex-1 min-h-11"
                    >
                      {t('recurring.pause')}
                    </Button>
                  ))}
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="rule-delete"
                  disabled={busy}
                  onClick={() => setDeleteOpen(true)}
                  className="flex-1 min-h-11 border border-danger/30 text-danger hover:text-danger hover:bg-danger-soft"
                >
                  {t('recurring.deleteRule')}
                </Button>
              </div>
              <p className="m-0 px-1 text-xs text-muted-foreground">
                {t('recurring.deleteKeepsNote')}
              </p>
            </div>

            <Sheet
              open={deleteOpen}
              onClose={() => setDeleteOpen(false)}
              title={t('recurring.deleteConfirmTitle')}
            >
              <div className="flex flex-col gap-4 pb-2">
                <p className="m-0 text-sm text-muted-foreground">
                  {t('recurring.deleteKeepsNote')}
                </p>
                {deleteRule.error && <InlineError error={deleteRule.error} />}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDeleteOpen(false)}
                    className="flex-1 min-h-11"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    data-testid="rule-delete-confirm"
                    loading={deleteRule.isPending}
                    onClick={() => void handleConfirmDelete()}
                    className="flex-1 min-h-11"
                  >
                    {t('recurring.deleteRule')}
                  </Button>
                </div>
              </div>
            </Sheet>
          </>
        )}
      </div>
      {toast && <Snackbar message={toast} />}
    </Screen>
  );
}
