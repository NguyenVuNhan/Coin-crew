import { useState } from 'react';
import type { HistoryGap, HistoryLine, HistoryPlace } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { cn } from '@cc/web-ui/lib/utils';
import { HistoryList } from './HistoryList';

export interface LedgerPlace {
  /** 'direct' merges every direct place into one row. */
  id: string; // tripId, or 'direct'
  kind: 'group' | 'direct';
  label: string; // group name, or t('person.quickExpenses') / t('request.quickExpenses', { owner })
  amount: number; // owner's view
  lines: HistoryLine[]; // newest first (merged for 'direct')
  summary: { twoWay: number; suggested: number; gap: HistoryGap | null; viaName?: string | null } | null;
  theirsTripIds?: Set<string>;
  groupHref?: string; // '/t/<tripId>' for groups on the person page; omitted on /r
}

/** Pure: one merged 'direct' row first (when any), then the groups in input order. */
export function toLedgerPlaces(places: HistoryPlace[], labels: { quickExpenses: string }): LedgerPlace[] {
  const direct = places.filter((p) => p.kind === 'direct');
  const out: LedgerPlace[] = [];
  if (direct.length > 0) {
    const lines = direct
      .flatMap((p) => p.history?.lines ?? [])
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const theirs = direct.filter((p) => p.source === 'theirs').map((p) => p.tripId);
    out.push({
      id: 'direct',
      kind: 'direct',
      label: labels.quickExpenses,
      amount: direct.reduce((sum, p) => sum + p.amount, 0),
      lines,
      summary: null,
      ...(theirs.length > 0 ? { theirsTripIds: new Set(theirs) } : {}),
    });
  }
  for (const p of places) {
    if (p.kind !== 'group') continue;
    const h = p.history;
    out.push({
      id: p.tripId,
      kind: 'group',
      label: p.tripName,
      amount: p.amount,
      lines: h?.lines ?? [],
      summary: h?.gap ? { twoWay: h.twoWay, suggested: h.suggested, gap: h.gap } : null,
    });
  }
  return out;
}

export interface PersonLedgerProps {
  places: LedgerPlace[];
  otherName: string;
  perspective?: 'owner' | 'other';
  /** 'sheet': a row opens PlaceSheet (person page). 'inline': a row expands its compact lines in place (inside the /r sheet). */
  open: 'sheet' | 'inline';
  /** Person page: the place whose sheet is open (controlled, for ?open=). */
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
  /** The row's data-testid. Default `ledger-row-<id>`. */
  rowTestId?: (place: LedgerPlace) => string;
}

/** + / − and Leaf / Lychee like HistoryList, from the viewer's side. */
function SignedAmount({ value, size = 'md' }: { value: number; size?: 'md' | 'lg' }) {
  const tone = value > 0 ? 'success' : value < 0 ? 'danger' : 'neutral';
  return (
    <span
      className={cn(
        'fsl-ledger__amount inline-flex shrink-0 items-center tabular-nums font-semibold',
        value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-foreground',
      )}
    >
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      <Amount value={Math.abs(value)} tone={tone} size={size} />
    </span>
  );
}

function PlaceSheet({
  place,
  otherName,
  perspective,
  onClose,
}: {
  place: LedgerPlace;
  otherName: string;
  perspective: 'owner' | 'other';
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Sheet open onClose={onClose} title={place.label}>
      <HistoryList
        lines={place.lines}
        otherName={otherName}
        perspective={perspective}
        summary={place.summary ?? undefined}
        theirsTripIds={place.theirsTripIds}
      />
      {place.kind === 'group' && place.groupHref && (
        <Button variant="ghost" block href={place.groupHref} className="mt-3" data-testid="ledger-open-group">
          {t('history.openGroup', { group: place.label })}
        </Button>
      )}
    </Sheet>
  );
}

export function PersonLedger({
  places,
  otherName,
  perspective = 'owner',
  open,
  openId,
  onOpenChange,
  rowTestId = (p) => `ledger-row-${p.id}`,
}: PersonLedgerProps) {
  const t = useT();
  const sign = perspective === 'owner' ? 1 : -1;
  // Sheet mode: controlled when openId is given, otherwise local.
  const [localOpen, setLocalOpen] = useState<string | null>(null);
  const sheetId = openId !== undefined ? openId : localOpen;
  const setSheetId = (id: string | null) => {
    if (openId === undefined) setLocalOpen(id);
    onOpenChange?.(id);
  };
  // Inline mode: which rows are expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = places.reduce((sum, p) => sum + p.amount, 0);
  const sheetPlace = open === 'sheet' && sheetId ? places.find((p) => p.id === sheetId) : undefined;

  return (
    <>
      <ul className="fsl-ledger divide-y divide-border overflow-hidden rounded-xl bg-card">
        {places.map((p) => {
          const isOpen = open === 'inline' && expanded.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                className="fsl-ledger__row flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none"
                data-testid={rowTestId(p)}
                onClick={() => (open === 'sheet' ? setSheetId(p.id) : toggle(p.id))}
                {...(open === 'inline' ? { 'aria-expanded': isOpen } : {})}
              >
                <span className="min-w-0 truncate text-sm font-semibold">{p.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <SignedAmount value={sign * p.amount} />
                  <Icon
                    name={open === 'sheet' ? 'chevronRight' : isOpen ? 'chevronUp' : 'chevronDown'}
                    size={18}
                    className="text-muted-foreground"
                  />
                </span>
              </button>
              {isOpen && (
                <div className="fsl-ledger__lines bg-background px-2 py-2">
                  <HistoryList
                    lines={p.lines}
                    otherName={otherName}
                    perspective={perspective}
                    summary={p.summary ?? undefined}
                    theirsTripIds={p.theirsTripIds}
                    compact
                  />
                </div>
              )}
            </li>
          );
        })}
        <li className="fsl-ledger__total flex min-h-11 items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold">{t('history.total')}</span>
          <span className="flex shrink-0 items-center gap-2">
            <SignedAmount value={sign * total} />
            {/* Keeps the total in line with the row amounts (chevron width). */}
            <span aria-hidden className="size-[18px]" />
          </span>
        </li>
      </ul>
      {sheetPlace && (
        <PlaceSheet
          place={sheetPlace}
          otherName={otherName}
          perspective={perspective}
          onClose={() => setSheetId(null)}
        />
      )}
    </>
  );
}
