import { useMemo, useState, type CSSProperties, type JSX, type RefObject } from 'react';
import { isCategoryVisibleIn, type CategoryView, type VisibilityWallet } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError, ownError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { cn } from '@cc/web-ui/lib/utils';

export interface CategoryPickerProps {
  type: 'expense' | 'income';
  categories: CategoryView[];
  recentIds: string[];
  value: string | null;
  onChange(categoryId: string): void;
  transferSelected?: boolean;
  onSelectTransfer?: () => void;
  tradeSelected?: boolean;
  onTradeSelect?: () => void;
  showTrade?: boolean;
  disableNonTrade?: boolean;
  error?: string | null;
  highlightError?: boolean;
  gridRef?: RefObject<HTMLDivElement | null>;
  /** Wallet the entry goes to; filters offered categories by per-wallet visibility. */
  wallet?: VisibilityWallet;
  /** Enable fold view-transition names and tile stagger animation (touch mode). */
  transitionEnabled?: boolean;
  /** Category id currently pre-selected by the local guess; drawn with a dashed ring. */
  guessedId?: string | null;
  /** Category ids marked with a badge and secondary label. */
  markedIds?: ReadonlySet<string>;
  /** Secondary label shown under marked categories. */
  markedLabel?: string;
}

/** Tags a tapped tile's icon and label right before a View Transition snapshot is captured. */
function tagTappedTile(button: HTMLButtonElement | null): void {
  if (!button) return;
  const spans = button.querySelectorAll<HTMLElement>(':scope > span');
  if (spans[0]) spans[0].style.viewTransitionName = 'entry-cat-ic';
  if (spans[1]) spans[1].style.viewTransitionName = 'entry-cat-name';
}

import { categoryIconName } from './categoryIcon';

export function CategoryPicker({
  type,
  categories,
  recentIds,
  value,
  onChange,
  transferSelected = false,
  onSelectTransfer,
  tradeSelected = false,
  onTradeSelect,
  showTrade = false,
  disableNonTrade = false,
  error,
  highlightError = false,
  gridRef,
  wallet,
  transitionEnabled = false,
  guessedId = null,
  markedIds,
  markedLabel,
}: CategoryPickerProps): JSX.Element {
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);

  const visible = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.type === type &&
          !c.hidden &&
          (!wallet || isCategoryVisibleIn(c, categories, wallet)),
      ),
    [categories, type, wallet],
  );

  const maxTiles = showTrade && onTradeSelect ? 5 : 6;

  const tiles = useMemo(() => {
    const byId = new Map(visible.map((c) => [c.id, c]));
    const picked: CategoryView[] = [];
    const seen = new Set<string>();

    for (const id of recentIds) {
      if (picked.length >= maxTiles) break;
      const cat = byId.get(id);
      if (cat && !seen.has(cat.id)) {
        seen.add(cat.id);
        picked.push(cat);
      }
    }

    for (const cat of visible) {
      if (picked.length >= maxTiles) break;
      if (!seen.has(cat.id)) {
        seen.add(cat.id);
        picked.push(cat);
      }
    }

    if (value && !seen.has(value)) {
      const selectedCat = byId.get(value) ?? categories.find((c) => c.id === value && c.type === type);
      if (selectedCat) {
        if (picked.length >= maxTiles) {
          picked[maxTiles - 1] = selectedCat;
        } else {
          picked.push(selectedCat);
        }
      }
    }

    return picked;
  }, [visible, recentIds, value, categories, type, maxTiles]);

  const tree = useMemo(() => {
    const parents = visible
      .filter((c) => c.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const childrenByParent = new Map<string, CategoryView[]>();
    for (const cat of visible) {
      if (cat.parentId !== null) {
        const arr = childrenByParent.get(cat.parentId) ?? [];
        arr.push(cat);
        childrenByParent.set(cat.parentId, arr);
      }
    }
    for (const arr of childrenByParent.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    const orphanSubs = visible.filter(
      (c) => c.parentId !== null && !parents.some((p) => p.id === c.parentId),
    );
    return { parents, childrenByParent, orphanSubs };
  }, [visible]);

  const handleSelect = (id: string) => {
    onChange(id);
    setSheetOpen(false);
  };

  const tileStyle = (index: number): CSSProperties | undefined =>
    transitionEnabled ? ({ '--i': index } as CSSProperties) : undefined;
  const tradeIndex = onSelectTransfer ? 1 : 0;
  const catOffset = tradeIndex + (showTrade && onTradeSelect ? 1 : 0);

  return (
    <div data-testid="category-picker" className="fsl-category-picker">
      <div
        ref={gridRef}
        data-testid="category-grid"
        style={transitionEnabled ? { viewTransitionName: 'entry-tiles' } : undefined}
        className={cn(
          'grid grid-cols-4 gap-2 rounded-2xl',
          transitionEnabled && 'entry-tiles-enter',
          highlightError && 'ring-2 ring-danger transition-shadow duration-150 motion-reduce:transition-none',
        )}
      >
        {onSelectTransfer && (
          <button
            key="transfer"
            type="button"
            data-testid="category-tile-transfer"
            aria-pressed={transferSelected}
            aria-disabled={disableNonTrade || undefined}
            disabled={disableNonTrade}
            style={tileStyle(0)}
            onClick={
              disableNonTrade
                ? undefined
                : (e) => {
                    if (transitionEnabled) tagTappedTile(e.currentTarget);
                    onSelectTransfer();
                  }
            }
            className={cn(
              'min-h-11 flex flex-col items-center gap-1 p-1 rounded-2xl text-center cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              transitionEnabled && 'entry-tile',
              disableNonTrade && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span
              className={cn(
                'size-11 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center transition-shadow',
                transferSelected && 'ring-2 ring-primary',
              )}
            >
              <Icon name="swap" size={20} />
            </span>
            <span className="text-sm font-medium text-foreground leading-tight line-clamp-2 break-words w-full">
              {type === 'expense'
                ? t('personalEntry.transferToWallet')
                : t('personalEntry.transferFromWallet')}
            </span>
          </button>
        )}
        {showTrade && onTradeSelect && (
          <button
            key="trade"
            type="button"
            data-testid={type === 'expense' ? 'category-tile-buy' : 'category-tile-sell'}
            aria-pressed={tradeSelected}
            style={tileStyle(tradeIndex)}
            onClick={(e) => {
              if (transitionEnabled) tagTappedTile(e.currentTarget);
              onTradeSelect();
            }}
            className={cn(
              'min-h-11 flex flex-col items-center gap-1 p-1 rounded-2xl text-center cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              transitionEnabled && 'entry-tile',
            )}
          >
            <span
              className={cn(
                'size-11 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center transition-shadow',
                tradeSelected && 'ring-2 ring-primary',
              )}
            >
              <Icon name="trending-up" size={20} />
            </span>
            <span className="text-sm font-medium text-foreground leading-tight line-clamp-2 break-words w-full">
              {type === 'expense'
                ? t('personalEntry.buyAsset')
                : t('personalEntry.sellAsset')}
            </span>
          </button>
        )}
        {tiles.map((cat, idx) => {
          const selected = !transferSelected && !tradeSelected && value === cat.id;
          const isGuess = selected && guessedId === cat.id;
          const isMarked = Boolean(markedIds?.has(cat.id));
          return (
            <button
              key={cat.id}
              type="button"
              data-testid={`category-tile-${cat.id}`}
              data-guess={isGuess ? 'true' : undefined}
              aria-pressed={selected}
              aria-disabled={disableNonTrade || undefined}
              disabled={disableNonTrade}
              style={tileStyle(catOffset + idx)}
              onClick={
                disableNonTrade
                  ? undefined
                  : (e) => {
                      if (transitionEnabled) tagTappedTile(e.currentTarget);
                      onChange(cat.id);
                    }
              }
              className={cn(
                'min-h-11 flex flex-col items-center gap-1 p-1 rounded-2xl text-center cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                transitionEnabled && 'entry-tile',
                disableNonTrade && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span
                className={cn(
                  'relative size-11 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center transition-shadow',
                  selected && (isGuess ? 'border-2 border-dashed border-primary' : 'ring-2 ring-primary'),
                )}
              >
                <Icon name={categoryIconName(cat.icon, type)} size={20} />
                {isMarked && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                  >
                    <Icon name="check" size={10} />
                  </span>
                )}
              </span>
              <span className="text-sm font-medium text-foreground leading-tight line-clamp-2 break-words w-full">
                {cat.name}
              </span>
              {isMarked && markedLabel && (
                <span className="text-xs text-muted-foreground leading-tight w-full truncate">
                  {markedLabel}
                </span>
              )}
            </button>
          );
        })}

        <button
          key="more"
          type="button"
          data-testid="category-more"
          aria-disabled={disableNonTrade || undefined}
          disabled={disableNonTrade}
          style={tileStyle(catOffset + tiles.length)}
          onClick={disableNonTrade ? undefined : () => setSheetOpen(true)}
          className={cn(
            'min-h-11 flex flex-col items-center gap-1 p-1 rounded-2xl text-center cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            transitionEnabled && 'entry-tile',
            disableNonTrade && 'opacity-50 cursor-not-allowed',
          )}
        >
          <span className="size-11 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center">
            <Icon name="ellipsis" size={20} />
          </span>
          <span className="text-sm font-medium text-muted-foreground leading-tight line-clamp-2 break-words w-full">
            {t('personalEntry.moreCategories')}
          </span>
        </button>
      </div>

      {error && (
        <div data-testid="category-error" className="mt-2">
          <InlineError error={ownError(error)} />
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('personalEntry.pickCategory')}
      >
        <div data-testid="category-sheet-list" className="flex flex-col divide-y divide-border">
          {tree.parents.map((parent) => {
            const subs = tree.childrenByParent.get(parent.id) ?? [];
            const parentSelected = value === parent.id;
            return (
              <div key={parent.id} className="flex flex-col">
                <button
                  type="button"
                  data-testid={`category-option-${parent.id}`}
                  onClick={() => handleSelect(parent.id)}
                  className={cn(
                    'min-h-11 flex items-center gap-3 px-2 py-2 text-left text-base font-medium text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0',
                    parentSelected && 'text-primary font-semibold',
                  )}
                >
                  <span className="size-9 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                    <Icon name={categoryIconName(parent.icon, type)} size={18} />
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate">{parent.name}</span>
                    {markedIds?.has(parent.id) && markedLabel && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {markedLabel}
                      </span>
                    )}
                  </span>
                  {parentSelected && <Icon name="check" size={18} className="text-primary shrink-0" />}
                </button>
                {subs.map((sub) => {
                  const subSelected = value === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      data-testid={`category-option-${sub.id}`}
                      onClick={() => handleSelect(sub.id)}
                      className={cn(
                        'min-h-11 flex items-center gap-3 pl-10 pr-2 py-2 text-left text-base text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0',
                        subSelected && 'text-primary font-semibold',
                      )}
                    >
                      <span className="size-8 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                        <Icon name={categoryIconName(sub.icon, type)} size={16} />
                      </span>
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="truncate">{sub.name}</span>
                        {markedIds?.has(sub.id) && markedLabel && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {markedLabel}
                          </span>
                        )}
                      </span>
                      {subSelected && <Icon name="check" size={18} className="text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {tree.orphanSubs.map((sub) => {
            const subSelected = value === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                data-testid={`category-option-${sub.id}`}
                onClick={() => handleSelect(sub.id)}
                className={cn(
                  'min-h-11 flex items-center gap-3 px-2 py-2 text-left text-base text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0',
                  subSelected && 'text-primary font-semibold',
                )}
              >
                <span className="size-8 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                  <Icon name={categoryIconName(sub.icon, type)} size={16} />
                </span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="truncate">{sub.name}</span>
                  {markedIds?.has(sub.id) && markedLabel && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {markedLabel}
                    </span>
                  )}
                </span>
                {subSelected && <Icon name="check" size={18} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
