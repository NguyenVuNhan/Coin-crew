import { Fragment, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { foldForSearch } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { Input } from '@cc/web-ui/components/ui/input';
import { cn } from '@cc/web-ui/lib/utils';

export interface FilterPickViewProps<T extends { id: string; name: string }> {
  title: string;
  allLabel: string;
  items: T[];
  selectedId?: string;
  indentOf?(item: T): number;
  leadingOf?(item: T): ReactNode;
  sectionOf?(item: T): { key: string; label: string };
  testIdPrefix: string;
  onPick(id: string | undefined): void;
  onBack(): void;
}

const ROW_BASE =
  'flex w-full min-h-11 items-center justify-between gap-2 py-2.5 pr-4 text-left text-sm transition-colors cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none';

/** Sub-view inside the advanced-filters sheet for picking a single filter value. */
export function FilterPickView<T extends { id: string; name: string }>({
  title,
  allLabel,
  items,
  selectedId,
  indentOf,
  leadingOf,
  sectionOf,
  testIdPrefix,
  onPick,
  onBack,
}: FilterPickViewProps<T>): JSX.Element {
  const t = useT();
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    backBtnRef.current?.focus();
  }, []);

  const showSearch = items.length > 8;
  const filteredItems = useMemo(() => {
    const needle = foldForSearch(query.trim());
    if (!needle) return items;
    return items.filter((item) => foldForSearch(item.name).includes(needle));
  }, [items, query]);

  const sections = useMemo(() => {
    if (!sectionOf) return null;
    const map = new Map<string, { key: string; label: string; items: T[] }>();
    for (const item of filteredItems) {
      const sec = sectionOf(item);
      let group = map.get(sec.key);
      if (!group) {
        group = { key: sec.key, label: sec.label, items: [] };
        map.set(sec.key, group);
      }
      group.items.push(item);
    }
    return Array.from(map.values());
  }, [filteredItems, sectionOf]);

  const renderItem = (item: T) => {
    const indent = indentOf?.(item) ?? 0;
    const selected = selectedId === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onPick(item.id)}
        data-testid={`${testIdPrefix}-${item.id}`}
        data-indent={indent > 0 ? indent : undefined}
        aria-pressed={selected}
        className={cn(
          ROW_BASE,
          indent > 0 ? 'pl-8' : 'pl-4',
          selected ? 'font-semibold text-primary' : 'text-foreground',
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {leadingOf?.(item)}
          <span className="truncate">{item.name}</span>
        </span>
        {selected && <Icon name="check" size={16} className="shrink-0 text-primary" />}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3 pb-4 animate-in fade-in-0 slide-in-from-right-4 duration-150 ease-out motion-reduce:animate-none motion-reduce:transition-none">
      <div className="flex items-center gap-2">
        <button
          ref={backBtnRef}
          type="button"
          onClick={onBack}
          aria-label={t('transactions.backToFilters')}
          data-testid="tx-filter-pick-back"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer"
        >
          <Icon name="back" size={20} />
        </button>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>

      {showSearch && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('transactions.searchLabel')}
          aria-label={t('transactions.searchLabel')}
          data-testid="tx-filter-pick-search"
          className="min-h-11 text-base"
        />
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
        <button
          type="button"
          onClick={() => onPick(undefined)}
          data-testid={`${testIdPrefix}-all`}
          aria-pressed={selectedId === undefined}
          className={cn(
            ROW_BASE,
            'pl-4',
            selectedId === undefined ? 'font-semibold text-primary' : 'text-foreground',
          )}
        >
          <span className="truncate">{allLabel}</span>
          {selectedId === undefined && (
            <Icon name="check" size={16} className="shrink-0 text-primary" />
          )}
        </button>

        {sections
          ? sections.map((section) => (
              <Fragment key={section.key}>
                <div
                  data-testid={`${testIdPrefix}-section-${section.key}`}
                  className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-1"
                >
                  {section.label}
                </div>
                {section.items.map(renderItem)}
              </Fragment>
            ))
          : filteredItems.map(renderItem)}
      </div>
    </div>
  );
}
