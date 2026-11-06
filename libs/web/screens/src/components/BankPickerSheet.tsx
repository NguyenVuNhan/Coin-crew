import { useState, useEffect, type JSX } from 'react';
import { Input } from '@cc/web-ui/components/ui/input';
import { searchBankApps, type BankApp } from '@cc/core';
import { bankAppLogo } from '../lib/bankApps';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { useT } from '@cc/web-i18n';
import { Search, Check } from 'lucide-react';

export interface BankPickerSheetProps {
  open: boolean;
  onClose(): void;
  apps: BankApp[];
  recent: BankApp | null;
  onPick(app: BankApp): void;
}

export function BankPickerSheet({
  open,
  onClose,
  apps,
  recent,
  onPick,
}: BankPickerSheetProps): JSX.Element {
  const t = useT();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const trimmed = query.trim();
  const isQueryEmpty = trimmed === '';
  const popularApps = isQueryEmpty ? searchBankApps(apps, '') : [];
  const searchResults = isQueryEmpty ? [] : searchBankApps(apps, query);

  const renderRow = (app: BankApp, isRecent = false) => {
    const logo = bankAppLogo(app.appId);
    return (
      <button
        key={isRecent ? `recent-${app.appId}` : app.appId}
        type="button"
        onClick={() => onPick(app)}
        className="fsl-bank-row flex w-full items-center gap-3 min-h-11 px-4 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {logo && <img alt="" src={logo} className="size-8 rounded-lg shrink-0" />}
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-semibold text-base leading-normal truncate">
            {app.appName}
          </span>
          <span className="text-sm text-muted-foreground leading-normal truncate">
            {app.bankShortName ?? app.bankName}
          </span>
        </div>
        {isRecent && (
          <Check className="size-5 text-primary shrink-0" aria-hidden="true" />
        )}
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('pay.pickBank')} className="fsl-bank-picker">
      <div className="flex flex-col gap-4 pt-2">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('pay.searchBank')}
            placeholder={t('pay.searchBank')}
            className="w-full text-base min-h-11 rounded-xl bg-card pl-10 pr-4"
          />
        </div>

        <div className="space-y-4">
          {isQueryEmpty ? (
            <>
              {recent && (
                <div className="space-y-1.5">
                  <h3 className="text-xs uppercase font-semibold text-muted-foreground px-1">
                    {t('pay.recentBank')}
                  </h3>
                  <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {renderRow(recent, true)}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <h3 className="text-xs uppercase font-semibold text-muted-foreground px-1">
                  {t('pay.popularBanks')}
                </h3>
                <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
                  {popularApps.map((app) => renderRow(app))}
                </div>
              </div>
            </>
          ) : (
            <>
              {searchResults.length === 0 ? (
                <p className="fsl-bank-picker__empty text-sm text-muted-foreground py-4 text-center">
                  {t('pay.noBankMatch', { q: trimmed })}
                </p>
              ) : (
                <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
                  {searchResults.map((app) => renderRow(app))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
