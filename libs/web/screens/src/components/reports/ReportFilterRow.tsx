import { useState, type JSX } from 'react';
import type { ReportQuery, WalletDetailView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/ui/button';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { cn } from '@cc/web-ui/lib/utils';
import { WalletIcon } from '../WalletIcon';

export interface ReportFilterRowProps {
  query: ReportQuery;
  wallets: WalletDetailView[];
  onChange: (next: ReportQuery) => void;
}

export function ReportFilterRow({
  query,
  wallets,
  onChange,
}: ReportFilterRowProps): JSX.Element {
  const t = useT();
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);

  const activeWallet = query.walletId
    ? wallets.find((w) => w.id === query.walletId)
    : undefined;

  const walletLabel = activeWallet
    ? t('reports.walletScope', { name: activeWallet.name })
    : t('reports.allWallets');

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      {/* Wallet Scope Trigger Button */}
      <Button
        type="button"
        variant="outline"
        className="min-h-11 rounded-full px-3.5 py-2 text-sm font-medium flex items-center gap-2 border-border bg-card hover:bg-muted transition-colors motion-reduce:transition-none"
        onClick={() => setWalletSheetOpen(true)}
        aria-label={walletLabel}
      >
        {activeWallet ? (
          <WalletIcon icon={activeWallet.icon} size="xs" />
        ) : (
          <Icon name="wallet" size={16} className="text-muted-foreground" />
        )}
        <span className="truncate max-w-[180px] sm:max-w-[240px]">{walletLabel}</span>
        <Icon name="chevronDown" size={14} className="text-muted-foreground shrink-0" />
      </Button>

      {/* Groups Toggle Button */}
      <Button
        type="button"
        variant={query.includeGroups ? 'secondary' : 'outline'}
        aria-pressed={query.includeGroups}
        className={cn(
          'min-h-11 rounded-full px-3.5 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors motion-reduce:transition-none',
          query.includeGroups
            ? 'bg-secondary text-secondary-foreground border-secondary'
            : 'bg-card text-foreground border-border hover:bg-muted',
        )}
        onClick={() => onChange({ ...query, includeGroups: !query.includeGroups })}
      >
        <Icon
          name="users"
          size={16}
          className={query.includeGroups ? 'text-foreground' : 'text-muted-foreground'}
        />
        <span>{query.includeGroups ? t('reports.includeGroups') : t('reports.excludeGroups')}</span>
      </Button>

      {/* Wallet Picker Sheet */}
      <Sheet
        open={walletSheetOpen}
        onClose={() => setWalletSheetOpen(false)}
        title={t('reports.allWallets')}
      >
        <div className="flex flex-col gap-1 p-2 max-h-[70vh] overflow-y-auto">
          {/* Option: Tất cả ví */}
          <Button
            type="button"
            variant="ghost"
            className={cn(
              'w-full min-h-11 justify-between px-3 py-2.5 h-auto text-left font-normal rounded-xl transition-colors motion-reduce:transition-none',
              !query.walletId && 'bg-accent font-medium',
            )}
            onClick={() => {
              onChange({ ...query, walletId: undefined });
              setWalletSheetOpen(false);
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-7 rounded-lg bg-muted grid place-items-center shrink-0">
                <Icon name="wallet" size={16} className="text-muted-foreground" />
              </div>
              <span className="truncate text-sm text-foreground">{t('reports.allWallets')}</span>
            </div>
            {!query.walletId && <Icon name="check" size={18} className="shrink-0 text-primary" />}
          </Button>

          {/* Individual Wallets */}
          {wallets.map((w) => {
            const isSelected = query.walletId === w.id;
            return (
              <Button
                key={w.id}
                type="button"
                variant="ghost"
                className={cn(
                  'w-full min-h-11 justify-between px-3 py-2.5 h-auto text-left font-normal rounded-xl transition-colors motion-reduce:transition-none',
                  isSelected && 'bg-accent font-medium',
                )}
                onClick={() => {
                  onChange({ ...query, walletId: w.id });
                  setWalletSheetOpen(false);
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <WalletIcon icon={w.icon} size="xs" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-sm text-foreground">{w.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {w.currency}
                      {w.archived ? ` · ${t('trips.archived')}` : ''}
                      {w.excludeFromReports ? ` · ${t('walletForm.excludeFromReports')}` : ''}
                    </span>
                  </div>
                </div>
                {isSelected && <Icon name="check" size={18} className="shrink-0 text-primary" />}
              </Button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
