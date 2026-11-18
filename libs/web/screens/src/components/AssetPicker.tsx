import { useMemo, useState, type JSX } from 'react';
import { assetUnitText, normalizeName, type AssetView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { cn } from '@cc/web-ui/lib/utils';
import { AssetForm } from './AssetForm';

export interface AssetPickerProps {
  open: boolean;
  onClose(): void;
  assets: AssetView[];
  value: string | null;
  onSelect(asset: AssetView): void;
}

export function AssetPicker({
  open,
  onClose,
  assets,
  value,
  onSelect,
}: AssetPickerProps): JSX.Element {
  const t = useT();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const nonHidden = useMemo(
    () =>
      assets
        .filter((a) => !a.hidden)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [assets],
  );

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const a of assets) {
      if (a.groupName && !seen.has(a.groupName)) {
        seen.add(a.groupName);
        list.push(a.groupName);
      }
    }
    return list;
  }, [assets]);

  const showSearch = nonHidden.length > 8;

  const grouped = useMemo(() => {
    const needle = showSearch ? normalizeName(search) : '';
    const filtered = needle
      ? nonHidden.filter(
          (a) =>
            normalizeName(a.name).includes(needle) ||
            normalizeName(assetUnitText(a)).includes(needle) ||
            normalizeName(a.groupName).includes(needle),
        )
      : nonHidden;

    const map = new Map<string, AssetView[]>();
    for (const asset of filtered) {
      const bucket = map.get(asset.groupName);
      if (bucket) {
        bucket.push(asset);
      } else {
        map.set(asset.groupName, [asset]);
      }
    }
    return Array.from(map.entries());
  }, [nonHidden, search, showSearch]);

  const handleClose = () => {
    setCreating(false);
    setSearch('');
    onClose();
  };

  const handlePick = (asset: AssetView) => {
    onSelect(asset);
    handleClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={creating ? t('personalEntry.addAsset') : t('personalEntry.pickAsset')}
    >
      {creating ? (
        <AssetForm
          groups={groups}
          onSaved={handlePick}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <div data-testid="asset-picker-list" className="fsl-asset-picker flex flex-col gap-3">
          {showSearch && (
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('personalEntry.searchAssets')}
              data-testid="asset-picker-search"
              className="min-h-11 text-base"
            />
          )}

          {grouped.length === 0 ? (
            <EmptyState icon="coins" title={t('personalEntry.noAssets')} />
          ) : (
            <div className="flex flex-col gap-3">
              {grouped.map(([groupName, items]) => (
                <div key={groupName} className="flex flex-col">
                  <div className="px-2 py-1 text-sm font-semibold text-muted-foreground">
                    {groupName}
                  </div>
                  <div className="flex flex-col divide-y divide-border">
                    {items.map((asset) => {
                      const selected = asset.id === value;
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          data-testid={`asset-option-${asset.id}`}
                          onClick={() => handlePick(asset)}
                          className={cn(
                            'min-h-11 px-2 py-2.5 flex items-center justify-between gap-3 text-left text-base font-medium text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0',
                            selected && 'text-primary font-semibold',
                          )}
                        >
                          <span className="truncate">{asset.name}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-sm text-muted-foreground">{assetUnitText(asset)}</span>
                            {selected && <Icon name="check" size={18} className="text-primary" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            block
            data-testid="asset-picker-add"
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" size={18} />
            {t('personalEntry.addAsset')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
