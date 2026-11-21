import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  CURRENCIES,
  CURRENCY_CODES,
  searchCurrencies,
  type CurrencyCode,
} from '@cc/core';
import { useLang, useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { cn } from '@cc/web-ui/lib/utils';
import { CurrencyBadge } from './CurrencyBadge';

const POPULAR_CODES: readonly CurrencyCode[] = CURRENCY_CODES.filter(
  (code) => CURRENCIES[code].popular,
);
const OTHER_CODES: readonly CurrencyCode[] = CURRENCY_CODES.filter(
  (code) => !CURRENCIES[code].popular,
);

export interface CurrencyPickerSheetProps {
  open: boolean;
  onClose: () => void;
  value: CurrencyCode;
  onSelect: (code: CurrencyCode) => void;
}

/** Searchable sheet for choosing a currency from the 55-currency catalog. */
export function CurrencyPickerSheet({
  open,
  onClose,
  value,
  onSelect,
}: CurrencyPickerSheetProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const [query, setQuery] = useState('');

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setQuery('');
    }
    prevOpenRef.current = open;
  }, [open]);

  const trimmedQuery = query.trim();
  const matches = useMemo(
    () => (trimmedQuery ? searchCurrencies(trimmedQuery) : []),
    [trimmedQuery],
  );

  const renderRow = (code: CurrencyCode) => {
    const info = CURRENCIES[code];
    const selected = code === value;
    const label = lang === 'vi' ? info.nameVi : info.nameEn;

    return (
      <button
        key={code}
        type="button"
        data-testid={`currency-option-${code}`}
        aria-pressed={selected}
        onClick={() => {
          onSelect(code);
          onClose();
        }}
        className={cn(
          'w-full min-h-11 px-3 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          selected && 'bg-secondary/40',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <CurrencyBadge code={code} selected={selected} size="md" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{label}</span>
            <span className="text-xs text-muted-foreground">{`${code} · ${info.symbol}`}</span>
          </div>
        </div>
        {selected && <Icon name="check" size={18} className="text-primary shrink-0" />}
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('walletForm.pickCurrency')}>
      <div className="flex flex-col gap-4 pb-2">
        <Input
          type="search"
          data-testid="currency-picker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('walletForm.searchCurrency')}
          aria-label={t('walletForm.searchCurrency')}
          autoComplete="off"
          className="min-h-11 text-base"
        />

        {trimmedQuery ? (
          matches.length === 0 ? (
            <p className="m-0 py-8 text-center text-sm text-muted-foreground">
              {t('walletForm.noCurrencyMatch')}
            </p>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {matches.map(renderRow)}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-1.5">
              <h3 className="m-0 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('walletForm.popularCurrencies')}
              </h3>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {POPULAR_CODES.map(renderRow)}
              </div>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="m-0 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('walletForm.allCurrencies')}
              </h3>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {OTHER_CODES.map(renderRow)}
              </div>
            </section>
          </div>
        )}
      </div>
    </Sheet>
  );
}
