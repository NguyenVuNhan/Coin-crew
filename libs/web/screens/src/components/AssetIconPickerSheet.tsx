import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useLang, useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@cc/web-ui/components/ui/tabs';
import { cn } from '@cc/web-ui/lib/utils';
import {
  ASSET_ICON_PACKAGES,
  AssetIcon,
  searchAssetIcons,
  type AssetIconEntry,
  type AssetIconPackageId,
} from './AssetIcon';

function packageIdForIcon(value: string | null): AssetIconPackageId {
  if (!value) return 'crypto';
  const prefix = value.split(':')[0];
  if (prefix === 'crypto' || prefix === 'stocks' || prefix === 'gold' || prefix === 'property') {
    return prefix;
  }
  return 'crypto';
}

export interface AssetIconPickerSheetProps {
  open: boolean;
  onClose: () => void;
  value: string | null;
  onSelect: (icon: string | null) => void;
  asset?: { id: string; name: string };
}

/** Tabbed, searchable sheet for picking an asset icon from 4 packs or falling back to letters. */
export function AssetIconPickerSheet({
  open,
  onClose,
  value,
  onSelect,
  asset,
}: AssetIconPickerSheetProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<AssetIconPackageId>(() => packageIdForIcon(value));

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setQuery('');
      setActiveTab(packageIdForIcon(value));
    }
    prevOpenRef.current = open;
  }, [open, value]);

  const trimmedQuery = query.trim();
  const searchMatches = useMemo(
    () => (trimmedQuery ? searchAssetIcons(trimmedQuery) : []),
    [trimmedQuery],
  );

  const activePackage =
    ASSET_ICON_PACKAGES.find((pkg) => pkg.id === activeTab) ?? ASSET_ICON_PACKAGES[0]!;
  const previewAsset = asset ?? { id: 'new', name: '' };

  const renderTile = (item: AssetIconEntry) => {
    const selected = value === item.id;
    const label = lang === 'vi' ? item.labelVi : item.labelEn;

    return (
      <button
        key={item.id}
        type="button"
        data-testid={`asset-icon-option-${item.id}`}
        aria-pressed={selected}
        onClick={() => {
          onSelect(item.id);
          onClose();
        }}
        className={cn(
          'min-h-11 flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected
            ? 'border-primary bg-secondary/60 text-secondary-foreground ring-2 ring-primary'
            : 'border-border bg-card text-foreground hover:bg-muted/60',
        )}
      >
        <AssetIcon
          asset={{
            id: previewAsset.id,
            name: previewAsset.name,
            icon: item.id,
          }}
          size="md"
        />
        <span className="text-xs leading-tight text-foreground line-clamp-2 w-full">{label}</span>
      </button>
    );
  };

  const lettersSelected = !value;

  return (
    <Sheet open={open} onClose={onClose} title={t('assets.iconPick')}>
      <div className="flex flex-col gap-3 pb-2">
        <Input
          type="search"
          data-testid="asset-icon-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('assets.iconSearch')}
          aria-label={t('assets.iconSearch')}
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
              {searchMatches.map((item) => renderTile(item))}
            </div>
          )
        ) : (
          <>
            <Tabs
              value={activeTab}
              onValueChange={(next) => setActiveTab(next as AssetIconPackageId)}
            >
              <TabsList
                variant="line"
                data-testid="asset-icon-tabs"
                aria-label={t('assets.iconPick')}
                className="flex w-full justify-start items-center gap-1.5 overflow-x-auto pb-1 h-auto group-data-horizontal/tabs:h-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {ASSET_ICON_PACKAGES.map((pkg) => {
                  const active = pkg.id === activeTab;
                  return (
                    <TabsTrigger
                      key={pkg.id}
                      value={pkg.id}
                      data-testid={`asset-icon-tab-${pkg.id}`}
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

            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                data-testid="asset-icon-option-letters"
                aria-pressed={lettersSelected}
                onClick={() => {
                  onSelect(null);
                  onClose();
                }}
                className={cn(
                  'min-h-11 flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  lettersSelected
                    ? 'border-primary bg-secondary/60 text-secondary-foreground ring-2 ring-primary'
                    : 'border-border bg-card text-foreground hover:bg-muted/60',
                )}
              >
                <AssetIcon
                  asset={{
                    id: previewAsset.id,
                    name: previewAsset.name,
                    icon: null,
                  }}
                  size="md"
                />
                <span className="text-xs leading-tight text-foreground line-clamp-2 w-full">
                  {t('assets.iconLetters')}
                </span>
              </button>
              {activePackage.items.map((item) => renderTile(item))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
