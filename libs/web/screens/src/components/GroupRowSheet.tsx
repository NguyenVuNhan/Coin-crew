import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  createGroupWalletResolver,
  formatMoney,
  groupRowCategoryId,
  type GroupLinkView,
  type GroupRow,
  type GroupSettingsView,
} from '@cc/core';
import { useLang, useT, type Lang } from '@cc/web-i18n';
import {
  useCategories,
  useGroupSettings,
  useTags,
  useUpdateGroupLink,
  useWalletDetails,
  type UpdateGroupLinkInput,
} from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { cn } from '@cc/web-ui/lib/utils';
import { ledgerDetailsPath, type HomeDetailKind } from '../lib/detailsNav';
import { CategoryPicker } from './CategoryPicker';
import { categoryIconName } from './categoryIcon';
import { formatEntryDayLabel } from './EntryDateRow';
import { TagInput } from './TagInput';

export interface GroupRowSheetProps {
  row: GroupRow | null;
  open: boolean;
  onClose(): void;
}

type ExpandedField = 'category' | 'wallet' | 'tags' | null;

const DEFAULT_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

const FIELD_ROW_CLASS =
  'flex w-full min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer bg-transparent border-0';

function detailKindFor(source: GroupRow['source']): HomeDetailKind {
  if (source === 'payment') return 'payment';
  if (source === 'fund') return 'income';
  return 'expense';
}

function buildOutcomeSentence(
  row: GroupRow,
  lang: Lang,
  t: ReturnType<typeof useT>,
): string {
  if (row.source === 'fund') {
    return `${t('groupRow.fund')} · ${formatMoney(row.total, 'VND')}`;
  }

  if (row.source === 'payment') {
    const counterpart = row.counterpartName ?? '';
    const base = row.iPaid
      ? t('groupRow.paymentTo', { name: counterpart })
      : t('groupRow.paymentFrom', { name: counterpart });
    return `${base} · ${formatMoney(row.total, 'VND')}`;
  }

  const myShareText = formatMoney(row.myShare, 'VND');
  const sharePart =
    lang === 'vi' ? `Phần bạn ${myShareText}` : `Your share ${myShareText}`;
  const rest = Math.max(0, row.total - row.myShare);

  if (row.iPaid) {
    if (rest === 0) return sharePart;
    const restText = formatMoney(rest, 'VND');
    let owePart: string;
    if (row.people.length === 1) {
      const person = row.people[0]!;
      owePart =
        lang === 'vi'
          ? `${person} nợ bạn ${restText}`
          : `${person} owes you ${restText}`;
    } else if (row.people.length > 1) {
      const names = row.people.join(', ');
      if (rest % row.people.length === 0) {
        const eachText = formatMoney(rest / row.people.length, 'VND');
        owePart =
          lang === 'vi'
            ? `${names} mỗi người nợ bạn ${eachText}`
            : `${names} each owe you ${eachText}`;
      } else {
        owePart =
          lang === 'vi'
            ? `${names} nợ bạn ${restText}`
            : `${names} owe you ${restText}`;
      }
    } else {
      owePart = t('groupRow.youPaid', {
        total: formatMoney(row.total, 'VND'),
        rest: restText,
      });
    }
    return `${sharePart} · ${owePart}`;
  }

  const payer = row.payerName ?? '';
  if (payer && row.myShare > 0) {
    const owePart =
      lang === 'vi'
        ? `Bạn nợ ${payer} ${myShareText}`
        : `You owe ${payer} ${myShareText}`;
    return `${sharePart} · ${owePart}`;
  }
  if (payer) {
    return `${sharePart} · ${t('groupRow.paidBy', { name: payer })}`;
  }
  return sharePart;
}

function initialLink(row: GroupRow | null): GroupLinkView {
  return {
    walletId: row?.link?.walletId ?? null,
    categoryId: row?.link?.categoryId ?? null,
    tagIds: row?.link?.tagIds ?? [],
    intent: row?.link?.intent ?? null,
    excludeFromReports: row?.link?.excludeFromReports ?? false,
  };
}

export function GroupRowSheet({
  row,
  open,
  onClose,
}: GroupRowSheetProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();

  const walletsQuery = useWalletDetails({ enabled: open });
  const categoriesQuery = useCategories({ enabled: open });
  const tagsQuery = useTags({ enabled: open });
  const groupSettingsQuery = useGroupSettings({ enabled: open });
  const updateLink = useUpdateGroupLink();

  const [linkState, setLinkState] = useState<GroupLinkView>(() => initialLink(row));
  const [expanded, setExpanded] = useState<ExpandedField>(null);
  const [saveError, setSaveError] = useState<unknown>(null);

  const rowRootId = row?.rootId ?? null;
  const rowWalletId = row?.link?.walletId ?? null;
  const rowCategoryId = row?.link?.categoryId ?? null;
  const rowIntent = row?.link?.intent ?? null;
  const rowExclude = row?.link?.excludeFromReports ?? false;
  const rowTagKey = row?.link?.tagIds.join(',') ?? '';

  // Which open sheet the state belongs to, and whether the user has saved anything in it since.
  const syncedForRef = useRef<string | null>(null);
  const savedSinceOpenRef = useRef(false);

  useEffect(() => {
    const sheetKey = `${open}:${rowRootId}`;
    const reopened = syncedForRef.current !== sheetKey;
    syncedForRef.current = sheetKey;
    if (reopened) {
      savedSinceOpenRef.current = false;
      setExpanded(null);
      setSaveError(null);
    } else if (savedSinceOpenRef.current) {
      // A list reload started by an earlier save can land after a later one: the sheet's own state, set from
      // each save's answer, is newer, so the reload must not overwrite it or close the open field.
      return;
    }
    setLinkState({
      walletId: rowWalletId,
      categoryId: rowCategoryId,
      tagIds: rowTagKey ? rowTagKey.split(',') : [],
      intent: rowIntent,
      excludeFromReports: rowExclude,
    });
  }, [open, rowRootId, rowWalletId, rowCategoryId, rowIntent, rowExclude, rowTagKey]);

  const wallets = walletsQuery.data?.wallets ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const recentCategoryIds = categoriesQuery.data?.recentIds ?? [];
  const tags = tagsQuery.data?.tags ?? [];
  const settings = groupSettingsQuery.data?.settings ?? DEFAULT_SETTINGS;

  const vndWallets = useMemo(
    () => wallets.filter((w) => w.currency === 'VND' && !w.archived),
    [wallets],
  );

  const effectiveRow: GroupRow | null = useMemo(
    () => (row ? { ...row, link: linkState } : null),
    [row, linkState],
  );

  const resolveWalletId = useMemo(
    () => createGroupWalletResolver(wallets, null),
    [wallets],
  );

  const resolvedWalletId = effectiveRow ? resolveWalletId(effectiveRow) : null;
  const resolvedWallet = resolvedWalletId
    ? wallets.find((w) => w.id === resolvedWalletId)
    : undefined;

  const categoryType: 'expense' | 'income' =
    effectiveRow?.source === 'expense' &&
    effectiveRow.link?.intent === 'loan' &&
    !effectiveRow.iPaid
      ? 'income'
      : 'expense';

  const fallbackGroupCategoryId = useMemo(
    () =>
      categories.find((c) => c.type === categoryType && c.name === 'Nhóm')?.id ?? null,
    [categories, categoryType],
  );

  const resolvedCategoryId = effectiveRow
    ? groupRowCategoryId(effectiveRow, settings, fallbackGroupCategoryId)
    : null;
  const resolvedCategory = resolvedCategoryId
    ? categories.find((c) => c.id === resolvedCategoryId)
    : undefined;

  const tagById = useMemo(() => new Map(tags.map((tg) => [tg.id, tg])), [tags]);
  const tagIdByLowerName = useMemo(
    () => new Map(tags.map((tg) => [tg.name.toLowerCase(), tg.id])),
    [tags],
  );

  const selectedTagNames = useMemo(
    () => linkState.tagIds.map((id) => tagById.get(id)?.name ?? id),
    [linkState.tagIds, tagById],
  );

  const saveField = (
    input: UpdateGroupLinkInput,
    optimistic: Partial<GroupLinkView>,
    onDone?: () => void,
  ) => {
    if (!row) return;
    const prev = linkState;
    savedSinceOpenRef.current = true;
    setSaveError(null);
    setLinkState((curr) => ({ ...curr, ...optimistic }));
    updateLink.mutate(
      { rootId: row.rootId, input },
      {
        onSuccess: (res) => {
          setLinkState(res.link);
          onDone?.();
        },
        onError: (err) => {
          setLinkState(prev);
          setSaveError(err);
        },
      },
    );
  };

  const handleCategoryChange = (categoryId: string) => {
    saveField({ categoryId }, { categoryId }, () => setExpanded(null));
  };

  const handleWalletChange = (walletId: string) => {
    saveField({ walletId }, { walletId }, () => setExpanded(null));
  };

  const handleTagsChange = (nextNames: string[]) => {
    const nextIds = nextNames.map(
      (name) => tagIdByLowerName.get(name.toLowerCase()) ?? name,
    );
    saveField({ tagIds: nextIds }, { tagIds: nextIds });
  };

  const handleExcludeChange = (excludeFromReports: boolean) => {
    saveField({ excludeFromReports }, { excludeFromReports });
  };

  const sheetTitle = !row
    ? t('groupRow.sheetTitle')
    : row.source === 'payment'
      ? row.iPaid
        ? t('groupRow.paymentTo', { name: row.counterpartName ?? '' })
        : t('groupRow.paymentFrom', { name: row.counterpartName ?? '' })
      : row.title;

  const tripLabel = row
    ? row.isDirect
      ? t('transactions.typePerson')
      : row.tripName
    : '';
  const dateLabel = row ? formatEntryDayLabel(row.date, t) : '';
  const outcomeSentence = row ? buildOutcomeSentence(row, lang, t) : '';
  const openInGroupHref = row
    ? ledgerDetailsPath(row.tripId, detailKindFor(row.source), row.id)
    : '';

  return (
    <Sheet open={open && row !== null} onClose={onClose} title={sheetTitle}>
      {row && (
        <div
          data-testid="group-row-sheet"
          className="fsl-group-row-sheet flex flex-col gap-3 pb-2"
        >
          <p className="m-0 text-xs text-muted-foreground">
            {`${tripLabel} · ${dateLabel}`}
          </p>

          <div
            data-testid="group-row-outcome"
            className="rounded-xl bg-success-soft px-3 py-2.5 text-sm font-semibold text-success tabular-nums"
          >
            {outcomeSentence}
          </div>

          <p className="m-0 text-xs text-muted-foreground">
            {t('groupRow.editInGroup')}
          </p>

          <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
            <div>
              <button
                type="button"
                data-testid="group-row-field-category"
                aria-expanded={expanded === 'category'}
                onClick={() =>
                  setExpanded((curr) => (curr === 'category' ? null : 'category'))
                }
                className={FIELD_ROW_CLASS}
              >
                <span className="shrink-0 text-muted-foreground">
                  {t('transactions.categoryLabel')}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                  {resolvedCategory && (
                    <Icon
                      name={categoryIconName(resolvedCategory.icon, categoryType)}
                      size={16}
                      className="shrink-0 text-secondary-foreground"
                    />
                  )}
                  <span className="truncate">
                    {resolvedCategory?.name ?? t('transactions.otherCategory')}
                  </span>
                  <Icon
                    name="chevronRight"
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                </span>
              </button>

              {expanded === 'category' && (
                <div className="border-t border-border px-3 py-3">
                  <CategoryPicker
                    type={categoryType}
                    categories={categories}
                    recentIds={recentCategoryIds}
                    value={resolvedCategoryId}
                    onChange={handleCategoryChange}
                  />
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                data-testid="group-row-field-wallet"
                aria-expanded={expanded === 'wallet'}
                onClick={() =>
                  setExpanded((curr) => (curr === 'wallet' ? null : 'wallet'))
                }
                className={FIELD_ROW_CLASS}
              >
                <span className="shrink-0 text-muted-foreground">
                  {t('personalEntry.wallet')}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                  <span className="truncate">
                    {resolvedWallet?.name ?? ''}
                  </span>
                  <Icon
                    name="chevronRight"
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                </span>
              </button>

              {expanded === 'wallet' && (
                <div
                  data-testid="group-row-wallet-picker"
                  className="border-t border-border divide-y divide-border"
                >
                  {vndWallets.map((w) => {
                    const selected = resolvedWalletId === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        data-testid={`group-row-wallet-option-${w.id}`}
                        aria-pressed={selected}
                        disabled={updateLink.isPending}
                        onClick={() => handleWalletChange(w.id)}
                        className={cn(
                          'flex w-full min-h-11 items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer bg-transparent border-0',
                          selected ? 'font-semibold text-primary' : 'text-foreground',
                        )}
                      >
                        <span className="truncate">{w.name}</span>
                        {selected && (
                          <Icon name="check" size={16} className="shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                data-testid="group-row-field-tags"
                aria-expanded={expanded === 'tags'}
                onClick={() =>
                  setExpanded((curr) => (curr === 'tags' ? null : 'tags'))
                }
                className={FIELD_ROW_CLASS}
              >
                <span className="shrink-0 text-muted-foreground">
                  {t('personalEntry.tags')}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                  <span className="truncate">
                    {selectedTagNames.length > 0
                      ? selectedTagNames.map((n) => `#${n}`).join(' ')
                      : ''}
                  </span>
                  <Icon
                    name="chevronRight"
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                </span>
              </button>

              {expanded === 'tags' && (
                <div className="border-t border-border px-4 py-3">
                  <TagInput
                    value={selectedTagNames}
                    onChange={handleTagsChange}
                  />
                </div>
              )}
            </div>

            <div className="flex w-full min-h-12 items-center justify-between gap-3 px-4 py-2">
              <Label
                htmlFor="group-row-exclude-switch"
                className="flex-1 min-h-11 flex items-center text-sm font-normal text-muted-foreground cursor-pointer"
              >
                {t('personalEntry.excludeFromReports')}
              </Label>
              <Switch
                id="group-row-exclude-switch"
                checked={linkState.excludeFromReports}
                disabled={updateLink.isPending}
                onCheckedChange={handleExcludeChange}
                aria-label={t('personalEntry.excludeFromReports')}
                data-testid="group-row-exclude-switch"
              />
            </div>
          </div>

          {saveError !== null && <InlineError error={saveError} />}

          <Button
            variant="secondary"
            block
            href={openInGroupHref}
            onClick={onClose}
            data-testid="group-row-open-in-group"
            className="mt-1"
          >
            {t('groupRow.openInGroup')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
