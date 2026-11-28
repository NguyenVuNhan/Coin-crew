import { useState, type JSX } from 'react';
import { Link } from 'react-router';
import {
  formatMoney,
  type AssetView,
  type CategoryView,
  type CurrencyCode,
  type PlannedItemView,
  type RecurringDraft,
  type RecurringRuleView,
  type RecurringSchedule,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import {
  useConfirmPlanned,
  useCreateRule,
  useSkipPlanned,
} from '@cc/web-data-access/recurring';
import { Button } from '@cc/web-ui/components/Button';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { categoryIconName } from './categoryIcon';
import {
  formatDayMonth,
  isoWeekday,
  weekdayFullLabel,
  type TranslateFn,
} from '../lib/scheduleWords';

export const KNOWN_PLANNED_KINDS = new Set([
  'recurring_occurrence',
  'recurring_checkin',
  'recurring_paused',
  'rule_suggestion',
]);

export function isKnownPlannedKind(kind: string): boolean {
  return KNOWN_PLANNED_KINDS.has(kind);
}

export function pausedReasonLabel(
  reason: string | null | undefined,
  t: TranslateFn,
): string {
  switch (reason) {
    case 'checkin':
      return t('recurring.reasonCheckin');
    case 'waiting':
      return t('recurring.reasonWaiting');
    case 'missing_wallet':
      return t('recurring.reasonMissingWallet');
    case 'missing_category':
      return t('recurring.reasonMissingCategory');
    case 'missing_asset':
      return t('recurring.reasonMissingAsset');
    default:
      return t('recurring.reasonManual');
  }
}

export function draftTitle(
  draft: RecurringDraft | null | undefined,
  categoriesById: Map<string, CategoryView>,
  assetsById: Map<string, AssetView>,
  t: TranslateFn,
): string {
  if (!draft) return t('recurring.title');
  if (draft.type === 'buy') {
    const asset = draft.assetId ? assetsById.get(draft.assetId) : undefined;
    const assetLabel = asset ? asset.name : draft.note?.trim();
    return assetLabel ? t('recurring.buyName', { asset: assetLabel }) : t('recurring.typeBuy');
  }
  if (draft.type === 'transfer') {
    if (draft.note?.trim()) return draft.note.trim();
    return t('recurring.typeTransfer');
  }
  const cat = draft.categoryId ? categoriesById.get(draft.categoryId) : undefined;
  if (draft.note?.trim()) return draft.note.trim();
  if (cat?.name) return cat.name;
  return draft.type === 'income' ? t('recurring.typeIncome') : t('recurring.typeExpense');
}

export function draftIcon(
  draft: RecurringDraft | null | undefined,
  categoriesById: Map<string, CategoryView>,
): IconName {
  if (!draft) return 'repeat';
  if (draft.type === 'buy') return 'trending-up';
  if (draft.type === 'transfer') return 'swap';
  const cat = draft.categoryId ? categoriesById.get(draft.categoryId) : undefined;
  return categoryIconName(cat?.icon, draft.type === 'income' ? 'income' : 'expense');
}

export function draftCurrency(
  draft: RecurringDraft | null | undefined,
  walletsById: Map<string, WalletDetailView>,
): CurrencyCode {
  if (!draft) return 'VND';
  return walletsById.get(draft.walletId)?.currency ?? 'VND';
}

export function signedMoneyParts(
  draft: RecurringDraft,
  currency: CurrencyCode,
  approximate = false,
): { text: string; className: string } {
  const formatted = formatMoney(draft.amount, currency);
  const approx = approximate ? '~' : '';
  if (draft.type === 'expense' || draft.type === 'buy') {
    return {
      text: `${approx}\u2212${formatted}`,
      className: 'text-danger',
    };
  }
  if (draft.type === 'income') {
    return {
      text: `${approx}+${formatted}`,
      className: 'text-success',
    };
  }
  return {
    text: `${approx}${formatted}`,
    className: 'text-foreground',
  };
}

function scheduleUnitLabel(unit: RecurringSchedule['unit'] | undefined, t: TranslateFn): string {
  switch (unit) {
    case 'day':
      return t('recurring.unitDay');
    case 'week':
      return t('recurring.unitWeek');
    case 'year':
      return t('recurring.unitYear');
    default:
      return t('recurring.unitMonth');
  }
}

interface SuggestionPattern {
  schedule?: RecurringSchedule;
  amount?: number;
  categoryId?: string;
  walletId?: string;
  type?: 'expense' | 'income';
  count?: number;
}

export interface PlannedItemCardProps {
  item: PlannedItemView;
  rule?: RecurringRuleView;
  categoriesById: Map<string, CategoryView>;
  walletsById: Map<string, WalletDetailView>;
  assetsById: Map<string, AssetView>;
  onFeedback: (message: string) => void;
}

export function PlannedItemCard({
  item,
  rule,
  categoriesById,
  walletsById,
  assetsById,
  onFeedback,
}: PlannedItemCardProps): JSX.Element | null {
  const t = useT();
  const confirmPlanned = useConfirmPlanned();
  const skipPlanned = useSkipPlanned();
  const createRule = useCreateRule();
  const [error, setError] = useState<unknown>(null);

  if (!isKnownPlannedKind(item.kind)) {
    return null;
  }

  const busy = confirmPlanned.isPending || skipPlanned.isPending || createRule.isPending;

  if (item.kind === 'recurring_occurrence') {
    const draft = item.draft ?? rule?.draft ?? null;
    const name = draftTitle(draft, categoriesById, assetsById, t);
    const icon = draftIcon(draft, categoriesById);
    const currency = draftCurrency(draft, walletsById);
    const isBuy = draft?.type === 'buy';
    const isAskMe = Boolean(rule?.askMe) && !isBuy;
    const dueDate = formatDayMonth(item.dueOn);
    const meta = isBuy
      ? t('recurring.waitingBuyMeta', { date: dueDate })
      : isAskMe
        ? t('recurring.waitingAskMeta', { date: dueDate })
        : t('recurring.waitingDueMeta', { date: dueDate });
    const money = draft ? signedMoneyParts(draft, currency, isAskMe) : null;
    const editHref = `/entries/new?planned=${encodeURIComponent(item.id)}`;

    const handleConfirm = async () => {
      setError(null);
      try {
        await confirmPlanned.mutateAsync({ id: item.id });
        onFeedback(t('recurring.toastRecorded', { name }));
      } catch (err) {
        setError(err);
      }
    };

    const handleSkip = async () => {
      setError(null);
      try {
        await skipPlanned.mutateAsync(item.id);
        onFeedback(t('recurring.toastSkipped'));
      } catch (err) {
        setError(err);
      }
    };

    return (
      <div
        data-testid={`planned-item-${item.id}`}
        className="fsl-planned-item px-4 py-3 flex flex-col gap-2.5"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-9 rounded-full bg-warning-soft text-warning-foreground grid place-items-center shrink-0"
          >
            <Icon name={icon} size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{name}</div>
            <div className="text-xs text-muted-foreground leading-snug">{meta}</div>
          </div>
          {money && (
            <span
              className={`text-sm font-semibold tabular-nums whitespace-nowrap shrink-0 ${money.className}`}
            >
              {money.text}
            </span>
          )}
        </div>
        {error !== null && <InlineError error={error} />}
        <div className="flex flex-wrap items-center gap-2 pl-12">
          {isBuy ? (
            <>
              <Button
                variant="primary"
                href={editHref}
                data-testid="planned-edit"
                className="flex-1 min-h-11 px-3"
              >
                {t('recurring.enterAndConfirm')}
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={busy}
                loading={skipPlanned.isPending}
                data-testid="planned-skip"
                className="min-h-11 px-3"
              >
                {t('recurring.skip')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={busy}
                loading={confirmPlanned.isPending}
                data-testid="planned-confirm"
                className="flex-1 min-h-11 px-3"
              >
                {t('recurring.confirm')}
              </Button>
              <Button
                variant="secondary"
                href={editHref}
                data-testid="planned-edit"
                className="flex-1 min-h-11 px-3"
              >
                {t('recurring.edit')}
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={busy}
                loading={skipPlanned.isPending}
                data-testid="planned-skip"
                className="min-h-11 px-3"
              >
                {t('recurring.skip')}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === 'recurring_checkin') {
    const draft = rule?.draft ?? item.draft ?? null;
    const name = draftTitle(draft, categoriesById, assetsById, t);
    const icon = draftIcon(draft, categoriesById);
    const currency = draftCurrency(draft, walletsById);
    const amountText = draft ? formatMoney(draft.amount, currency) : '';
    const unit = scheduleUnitLabel(rule?.schedule.unit, t);
    const pausesAfter = item.meta?.pausesAfter as
      | { days?: number; occurrences?: number }
      | null
      | undefined;
    const meta =
      typeof pausesAfter?.days === 'number'
        ? t('recurring.checkinMetaDays', { amount: amountText, unit, days: pausesAfter.days })
        : t('recurring.checkinMetaOccurrences', {
            amount: amountText,
            unit,
            count: typeof pausesAfter?.occurrences === 'number' ? pausesAfter.occurrences : 3,
          });

    const handleStillUsing = async () => {
      setError(null);
      try {
        await confirmPlanned.mutateAsync({ id: item.id });
        onFeedback(t('recurring.toastKept', { name }));
      } catch (err) {
        setError(err);
      }
    };

    const handlePause = async () => {
      setError(null);
      try {
        await skipPlanned.mutateAsync(item.id);
        onFeedback(t('recurring.toastPaused', { name }));
      } catch (err) {
        setError(err);
      }
    };

    const headerBody = (
      <>
        <span
          aria-hidden="true"
          className="size-9 rounded-full bg-warning-soft text-warning-foreground grid place-items-center shrink-0"
        >
          <Icon name={icon} size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground leading-snug">
            {t('recurring.checkinTitle', { name })}
          </div>
          <div className="text-xs text-muted-foreground leading-snug tabular-nums">{meta}</div>
        </div>
      </>
    );

    return (
      <div
        data-testid={`planned-item-${item.id}`}
        className="fsl-planned-item px-4 py-3 flex flex-col gap-2.5"
      >
        {item.ruleId ? (
          <Link
            to={`/recurring/${encodeURIComponent(item.ruleId)}`}
            className="flex items-center gap-3 no-underline text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          >
            {headerBody}
          </Link>
        ) : (
          <div className="flex items-center gap-3">{headerBody}</div>
        )}
        {error !== null && <InlineError error={error} />}
        <div className="flex items-center gap-2 pl-12">
          <Button
            variant="primary"
            onClick={handleStillUsing}
            disabled={busy}
            loading={confirmPlanned.isPending}
            data-testid="planned-confirm"
            className="flex-1 min-h-11 px-3"
          >
            {t('recurring.stillUsing')}
          </Button>
          <Button
            variant="secondary"
            onClick={handlePause}
            disabled={busy}
            loading={skipPlanned.isPending}
            data-testid="planned-skip"
            className="flex-1 min-h-11 px-3"
          >
            {t('recurring.pause')}
          </Button>
        </div>
      </div>
    );
  }

  if (item.kind === 'recurring_paused') {
    const draft = rule?.draft ?? item.draft ?? null;
    const name = draftTitle(draft, categoriesById, assetsById, t);
    const icon = draftIcon(draft, categoriesById);
    const reason =
      typeof item.meta?.reason === 'string' ? item.meta.reason : (rule?.pausedReason ?? 'manual');

    const handleResume = async () => {
      setError(null);
      try {
        await confirmPlanned.mutateAsync({ id: item.id });
        onFeedback(t('recurring.toastResumed', { name }));
      } catch (err) {
        setError(err);
      }
    };

    const handleDismiss = async () => {
      setError(null);
      try {
        await skipPlanned.mutateAsync(item.id);
        onFeedback(t('recurring.toastSkipped'));
      } catch (err) {
        setError(err);
      }
    };

    return (
      <div
        data-testid={`planned-item-${item.id}`}
        className="fsl-planned-item px-4 py-3 flex flex-col gap-2.5"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-9 rounded-full bg-warning-soft text-warning-foreground grid place-items-center shrink-0"
          >
            <Icon name={icon} size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground leading-snug">
              {t('recurring.pausedTitle', { name })}
            </div>
            <div className="text-xs text-muted-foreground leading-snug">
              {pausedReasonLabel(reason, t)}
            </div>
          </div>
        </div>
        {error !== null && <InlineError error={error} />}
        <div className="flex items-center gap-2 pl-12">
          <Button
            variant="primary"
            onClick={handleResume}
            disabled={busy}
            loading={confirmPlanned.isPending}
            data-testid="planned-confirm"
            className="flex-1 min-h-11 px-3"
          >
            {t('recurring.resume')}
          </Button>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            disabled={busy}
            loading={skipPlanned.isPending}
            data-testid="planned-skip"
            className="min-h-11 px-3"
          >
            {t('recurring.skip')}
          </Button>
        </div>
      </div>
    );
  }

  // kind === 'rule_suggestion'
  const pattern = (item.meta?.pattern as SuggestionPattern | undefined) ?? undefined;
  const draft = item.draft;
  const categoryId = pattern?.categoryId ?? draft?.categoryId;
  const category = categoryId ? categoriesById.get(categoryId) : undefined;
  const categoryName = category?.name ?? draftTitle(draft, categoriesById, assetsById, t);
  const currency = draftCurrency(draft, walletsById);
  const amount = formatMoney(pattern?.amount ?? draft?.amount ?? 0, currency);
  const schedule = pattern?.schedule;
  const isWeekly = schedule?.unit === 'week';
  const count = pattern?.count ?? (isWeekly ? 4 : 3);
  const title = isWeekly
    ? t('recurring.suggestionTitleWeek', { category: categoryName })
    : t('recurring.suggestionTitleMonth', { category: categoryName });

  let meta: string;
  if (isWeekly) {
    const wd =
      schedule?.weekdays?.[0] ?? (schedule?.startDate ? isoWeekday(schedule.startDate) : 1);
    meta = t('recurring.suggestionMetaWeek', {
      amount,
      weekday: weekdayFullLabel(wd, t),
      count,
    });
  } else {
    const day =
      typeof schedule?.monthDay === 'number'
        ? schedule.monthDay
        : Number((schedule?.startDate ?? item.dueOn).split('-')[2] ?? 1);
    meta = t('recurring.suggestionMetaMonth', { amount, day, count });
  }

  const handleCreateRule = async () => {
    setError(null);
    try {
      if (draft && schedule) {
        await createRule.mutateAsync({
          draft,
          schedule,
          askMe: false,
        });
      }
      await confirmPlanned.mutateAsync({ id: item.id });
      onFeedback(t('recurring.toastRuleCreated'));
    } catch (err) {
      setError(err);
    }
  };

  const handleDecline = async () => {
    setError(null);
    try {
      await skipPlanned.mutateAsync(item.id);
      onFeedback(t('recurring.toastSkipped'));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div
      data-testid={`planned-item-${item.id}`}
      className="fsl-planned-item px-4 py-3 flex flex-col gap-2.5"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="size-9 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
        >
          <Icon name="lightbulb" size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground leading-snug">{title}</div>
          <div className="text-xs text-muted-foreground leading-snug tabular-nums">{meta}</div>
        </div>
      </div>
      {error !== null && <InlineError error={error} />}
      <div className="flex items-center gap-2 pl-12">
        <Button
          variant="secondary"
          onClick={handleCreateRule}
          disabled={busy}
          loading={createRule.isPending || confirmPlanned.isPending}
          data-testid="planned-confirm"
          className="flex-1 min-h-11 px-3"
        >
          {t('recurring.createRule')}
        </Button>
        <Button
          variant="ghost"
          onClick={handleDecline}
          disabled={busy}
          loading={skipPlanned.isPending}
          data-testid="planned-skip"
          className="min-h-11 px-3"
        >
          {t('recurring.no')}
        </Button>
      </div>
    </div>
  );
}
