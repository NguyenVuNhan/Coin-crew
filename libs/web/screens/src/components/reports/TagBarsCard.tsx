import { useState } from 'react';
import { Link } from 'react-router';
import {
  filterReportTags,
  formatMoney,
  type CurrencyCode,
  type ReportData,
  type ReportPeriodWindow,
  type ReportQuery,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Card } from '@cc/web-ui/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@cc/web-ui/components/ui/tabs';
import { Input } from '@cc/web-ui/components/ui/input';
import { Button } from '@cc/web-ui/components/ui/button';
import { cn } from '@cc/web-ui/lib/utils';
import { buildTransactionsTagUrl } from './reportUrl';

export interface TagBarsCardProps {
  tags: ReportData['tags'];
  period: ReportPeriodWindow;
  query: ReportQuery;
  currency: CurrencyCode;
  approximate: boolean;
}

export function TagBarsCard({
  tags,
  period,
  query,
  currency,
  approximate,
}: TagBarsCardProps) {
  const t = useT();

  const expenseTags = tags?.expense ?? [];
  const incomeTags = tags?.income ?? [];
  const hasMultiTagOverlap = Boolean(tags?.hasMultiTagOverlap);

  const [side, setSide] = useState<'expense' | 'income'>(() => {
    if (expenseTags.length === 0 && incomeTags.length > 0) return 'income';
    return 'expense';
  });
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');

  const activeList = side === 'expense' ? expenseTags : incomeTags;
  const filtered = filterReportTags(activeList, search);
  const visible = search.trim() || expanded ? filtered : filtered.slice(0, 5);
  const maxAmount = Math.max(1, ...filtered.map((item) => item.amount));
  const approxPrefix = approximate ? '≈ ' : '';

  return (
    <Card className="p-4 rounded-xl bg-card border border-border shadow-none ring-0 flex flex-col gap-3 w-full text-card-foreground">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold text-foreground">
          {t('reports.tagsTitle')}
        </h3>
        <Tabs
          value={side}
          onValueChange={(v) => {
            setSide(v as 'expense' | 'income');
            setExpanded(false);
            setSearch('');
          }}
        >
          <TabsList className="group-data-horizontal/tabs:h-auto min-h-11 p-1">
            <TabsTrigger value="expense" className="min-h-11 px-3">
              {t('reports.tabExpense')}
            </TabsTrigger>
            <TabsTrigger value="income" className="min-h-11 px-3">
              {t('reports.tabIncome')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeList.length > 6 && (
        <div className="pt-1">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('reports.tagsSearchPlaceholder')}
            aria-label={t('reports.tagsSearchPlaceholder')}
            className="text-base min-h-11"
          />
        </div>
      )}

      {activeList.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t('reports.noTagsData')}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t('reports.tagsNoSearchMatch')}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((item) => (
            <Link
              key={item.tagId}
              to={buildTransactionsTagUrl(item.tagId, period, query)}
              className="block min-h-11 py-1.5 px-2 rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-semibold text-sm truncate">
                  #{item.name}
                </span>
                <span className="tabular-nums text-sm font-medium shrink-0">
                  {approxPrefix}
                  {formatMoney(item.amount, currency)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  style={{
                    width: `${Math.max(4, Math.round((item.amount / maxAmount) * 100))}%`,
                  }}
                  className={cn(
                    'h-full rounded-full transition-all motion-reduce:transition-none',
                    side === 'expense' ? 'bg-danger' : 'bg-success',
                  )}
                />
              </div>
              <span className="block mt-1 text-xs tabular-nums text-muted-foreground">
                {t('reports.tagsEntryCount', { count: String(item.entryCount) })} · {item.percent}%
              </span>
            </Link>
          ))}
        </div>
      )}

      {!search.trim() && filtered.length > 5 && (
        <Button
          type="button"
          variant="outline"
          className="w-full min-h-11 rounded-full mt-1"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded
            ? t('reports.tagsCollapse')
            : t('reports.tagsShowAll', { count: String(filtered.length) })}
        </Button>
      )}

      {hasMultiTagOverlap && (
        <p className="text-xs text-muted-foreground mt-1">
          {t('reports.tagsMultiOverlapNote')}
        </p>
      )}
    </Card>
  );
}
