import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useLang, useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@cc/web-ui/components/ui/tabs';
import { cn } from '@cc/web-ui/lib/utils';
import {
  WALLET_AVATAR_TONES,
  WALLET_ICON_PACKAGES,
  WalletIcon,
  searchWalletIcons,
  type WalletIconEntry,
  type WalletIconPackageId,
} from './WalletIcon';

const TONE_DOT_CLASSES: Record<(typeof WALLET_AVATAR_TONES)[number], string> = {
  '1': 'bg-avatar-1',
  '2': 'bg-avatar-2',
  '3': 'bg-avatar-3',
  '4': 'bg-avatar-4',
  '5': 'bg-avatar-5',
  '6': 'bg-avatar-6',
};

function packageIdForIcon(value: string): WalletIconPackageId {
  const prefix = value.split(':')[0];
  if (prefix === 'bank') return 'bank';
  if (prefix === 'ewallet') return 'ewallet';
  if (prefix === 'save') return 'save';
  if (prefix === 'inv') return 'inv';
  if (prefix === 'life') return 'life';
  if (prefix === 'fam' || prefix === 'biz') return 'fam';
  return 'basic';
}

function toneFromIcon(value: string): (typeof WALLET_AVATAR_TONES)[number] | null {
  const legacy = /^bg-avatar-([1-6])$/.exec(value);
  if (legacy) return legacy[1] as (typeof WALLET_AVATAR_TONES)[number];
  const basic = /^basic:[^:]+:([1-6])$/.exec(value);
  if (basic) return basic[1] as (typeof WALLET_AVATAR_TONES)[number];
  return null;
}

function applyToneToBasicId(
  id: string,
  tone: (typeof WALLET_AVATAR_TONES)[number] | null,
): string {
  if (!tone || !id.startsWith('basic:')) return id;
  const [, glyph = 'wallet'] = id.split(':');
  return `basic:${glyph}:${tone}`;
}

function isIconMatch(candidateId: string, selectedValue: string): boolean {
  if (candidateId === selectedValue) return true;
  const legacy = /^bg-avatar-([1-6])$/.exec(selectedValue);
  return Boolean(legacy && candidateId === `basic:wallet:${legacy[1]}`);
}

export interface WalletIconPickerSheetProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onSelect: (icon: string) => void;
}

/** Tabbed, category-searchable sheet for picking a wallet icon from 7 themed packages. */
export function WalletIconPickerSheet({
  open,
  onClose,
  value,
  onSelect,
}: WalletIconPickerSheetProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<WalletIconPackageId>(() => packageIdForIcon(value));
  const [toneOverride, setToneOverride] = useState<(typeof WALLET_AVATAR_TONES)[number] | null>(
    null,
  );

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setQuery('');
      setActiveTab(packageIdForIcon(value));
      setToneOverride(null);
    }
    prevOpenRef.current = open;
  }, [open, value]);

  const trimmedQuery = query.trim();
  const searchMatches = useMemo(
    () => (trimmedQuery ? searchWalletIcons(trimmedQuery) : []),
    [trimmedQuery],
  );

  const activePackage =
    WALLET_ICON_PACKAGES.find((pkg) => pkg.id === activeTab) ?? WALLET_ICON_PACKAGES[0]!;
  const effectiveTone = toneOverride ?? toneFromIcon(value) ?? '5';

  const renderTile = (item: WalletIconEntry, useToneOverride: boolean) => {
    const effectiveId = useToneOverride ? applyToneToBasicId(item.id, toneOverride) : item.id;
    const selected = isIconMatch(effectiveId, value);
    const label = lang === 'vi' ? item.labelVi : item.labelEn;

    return (
      <button
        key={effectiveId}
        type="button"
        data-testid={`wallet-icon-option-${effectiveId}`}
        aria-pressed={selected}
        onClick={() => {
          onSelect(effectiveId);
          onClose();
        }}
        className={cn(
          'min-h-11 flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected
            ? 'border-primary bg-secondary/60 text-secondary-foreground'
            : 'border-border bg-card text-foreground hover:bg-muted/60',
        )}
      >
        <WalletIcon icon={effectiveId} size="md" />
        <span className="text-[11px] leading-tight text-foreground line-clamp-2 w-full">
          {label}
        </span>
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('walletForm.pickIcon')}>
      <div className="flex flex-col gap-3 pb-2">
        <Input
          type="search"
          data-testid="wallet-icon-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('walletForm.searchIcon')}
          aria-label={t('walletForm.searchIcon')}
          autoComplete="off"
          className="min-h-11 text-base"
        />

        {trimmedQuery ? (
          searchMatches.length === 0 ? (
            <p className="m-0 py-8 text-center text-sm text-muted-foreground">
              {t('walletForm.noIconMatch')}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {searchMatches.map((item) => renderTile(item, false))}
            </div>
          )
        ) : (
          <>
            <Tabs
              value={activeTab}
              onValueChange={(next) => setActiveTab(next as WalletIconPackageId)}
            >
              <TabsList
                variant="line"
                data-testid="wallet-icon-tabs"
                aria-label={t('walletForm.pickIcon')}
                className="flex w-full justify-start items-center gap-1.5 overflow-x-auto pb-1 h-auto group-data-horizontal/tabs:h-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {WALLET_ICON_PACKAGES.map((pkg) => {
                  const active = pkg.id === activeTab;
                  return (
                    <TabsTrigger
                      key={pkg.id}
                      value={pkg.id}
                      data-testid={`wallet-icon-tab-${pkg.id}`}
                      className={cn(
                        'min-h-11 h-11 flex-none shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors cursor-pointer after:hidden',
                        active
                          ? 'border-primary bg-secondary text-secondary-foreground data-active:bg-secondary data-active:text-secondary-foreground'
                          : 'border-border bg-card text-foreground hover:bg-muted',
                      )}
                    >
                      <Icon name={pkg.tabIcon} size={14} />
                      <span>{lang === 'vi' ? pkg.tabLabelVi : pkg.tabLabelEn}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            {activeTab === 'basic' && (
              <div
                role="group"
                aria-label={t('walletForm.iconTone')}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-1"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {t('walletForm.iconTone')}
                </span>
                <div className="flex items-center gap-0.5">
                  {WALLET_AVATAR_TONES.map((tone) => {
                    const active = effectiveTone === tone;
                    return (
                      <button
                        key={tone}
                        type="button"
                        data-testid={`wallet-icon-tone-${tone}`}
                        aria-label={`${t('walletForm.iconTone')} ${tone}`}
                        aria-pressed={active}
                        onClick={() => setToneOverride(tone)}
                        className="size-11 grid place-items-center rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            'size-6 rounded-full transition-transform',
                            TONE_DOT_CLASSES[tone],
                            active && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105',
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2">
              {activePackage.items.map((item) => renderTile(item, activeTab === 'basic'))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
