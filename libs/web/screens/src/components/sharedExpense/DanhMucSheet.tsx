import { useEffect, useMemo, useState, type JSX } from 'react';
import { FIXED_CATEGORIES, type CategoryView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { cn } from '@cc/web-ui/lib/utils';
import { categoryIconName } from '../categoryIcon';

/** value is a fixed key in groups; in Sổ chi tiêu it may be a personal category id. */
export type DanhMucValue =
  | { kind: 'fixed'; key: string }
  | { kind: 'personal'; id: string }
  | null;

export interface DanhMucSheetProps {
  open: boolean;
  onClose(): void;
  value: DanhMucValue;
  onChange(v: DanhMucValue): void;
  /** Present only in Sổ chi tiêu: adds the user's visible custom categories, hides their hidden fixed ones. */
  personal?: { categories: CategoryView[] };
}

interface PickerItem {
  value: Exclude<DanhMucValue, null>;
  id: string;
  name: string;
  icon: string;
}

interface PickerGroup {
  parent: PickerItem;
  children: PickerItem[];
}

function foldVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function isSameValue(a: DanhMucValue, b: Exclude<DanhMucValue, null>): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind === 'fixed' && b.kind === 'fixed' ? a.key === b.key : a.kind === 'personal' && b.kind === 'personal' && a.id === b.id;
}

export function DanhMucSheet({
  open,
  onClose,
  value,
  onChange,
  personal,
}: DanhMucSheetProps): JSX.Element {
  const t = useT();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const { groups, orphans } = useMemo(() => {
    const hiddenFixedKeys = new Set<string>();
    const personalFixedIdToKey = new Map<string, string>();

    if (personal) {
      for (const cat of personal.categories) {
        if (cat.systemKey) {
          personalFixedIdToKey.set(cat.id, cat.systemKey);
          if (cat.hidden) hiddenFixedKeys.add(cat.systemKey);
        }
      }
    }

    const fixedExpense = FIXED_CATEGORIES.filter(
      (c) => c.type === 'expense' && (!personal || !hiddenFixedKeys.has(c.key)),
    );

    const fixedGroupMap = new Map<string, PickerGroup>();
    const nextGroups: PickerGroup[] = [];
    const nextOrphans: PickerItem[] = [];

    for (const c of fixedExpense) {
      const item: PickerItem = {
        value: { kind: 'fixed', key: c.key },
        id: c.key,
        name: c.name,
        icon: c.icon,
      };
      if (c.parentKey === null) {
        const group: PickerGroup = { parent: item, children: [] };
        fixedGroupMap.set(c.key, group);
        nextGroups.push(group);
      } else {
        const parentGroup = fixedGroupMap.get(c.parentKey);
        if (parentGroup) {
          parentGroup.children.push(item);
        } else {
          nextOrphans.push(item);
        }
      }
    }

    if (personal) {
      const customVisible = personal.categories
        .filter((c) => c.type === 'expense' && !c.hidden && !c.systemKey)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const customParents = customVisible.filter((c) => c.parentId === null);
      const customGroupMap = new Map<string, PickerGroup>();

      for (const c of customParents) {
        const group: PickerGroup = {
          parent: {
            value: { kind: 'personal', id: c.id },
            id: c.id,
            name: c.name,
            icon: c.icon,
          },
          children: [],
        };
        customGroupMap.set(c.id, group);
        nextGroups.push(group);
      }

      for (const c of customVisible) {
        if (c.parentId === null) continue;
        const item: PickerItem = {
          value: { kind: 'personal', id: c.id },
          id: c.id,
          name: c.name,
          icon: c.icon,
        };
        const fixedParentKey = personalFixedIdToKey.get(c.parentId);
        const fixedGroup = fixedParentKey ? fixedGroupMap.get(fixedParentKey) : undefined;
        if (fixedGroup) {
          fixedGroup.children.push(item);
          continue;
        }
        const customGroup = customGroupMap.get(c.parentId);
        if (customGroup) {
          customGroup.children.push(item);
          continue;
        }
        nextOrphans.push(item);
      }
    }

    return { groups: nextGroups, orphans: nextOrphans };
  }, [personal]);

  const foldedQuery = foldVietnamese(query.trim());

  const filtered = useMemo(() => {
    if (!foldedQuery) return { searching: false, groups, orphans, flat: [] as PickerItem[] };
    const flat: PickerItem[] = [];
    for (const group of groups) {
      if (foldVietnamese(group.parent.name).includes(foldedQuery)) {
        flat.push(group.parent);
      }
      for (const child of group.children) {
        if (foldVietnamese(child.name).includes(foldedQuery)) {
          flat.push(child);
        }
      }
    }
    for (const orphan of orphans) {
      if (foldVietnamese(orphan.name).includes(foldedQuery)) {
        flat.push(orphan);
      }
    }
    return { searching: true, groups: [] as PickerGroup[], orphans: [] as PickerItem[], flat };
  }, [foldedQuery, groups, orphans]);

  const handleSelect = (next: DanhMucValue) => {
    onChange(next);
    onClose();
  };

  const renderRow = (item: PickerItem, indented: boolean) => {
    const selected = isSameValue(value, item.value);
    return (
      <button
        key={`${item.value.kind}:${item.id}`}
        type="button"
        data-testid={`danh-muc-option-${item.id}`}
        aria-pressed={selected}
        onClick={() => handleSelect(item.value)}
        className={cn(
          'min-h-11 flex items-center gap-3 py-2 text-left text-base text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          indented ? 'pl-10 pr-2' : 'px-2 font-medium',
          selected && 'text-primary font-semibold',
        )}
      >
        <span
          className={cn(
            'rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0',
            indented ? 'size-8' : 'size-9',
          )}
        >
          <Icon name={categoryIconName(item.icon, 'expense')} size={indented ? 16 : 18} />
        </span>
        <span className="flex-1 truncate">{item.name}</span>
        {selected && <Icon name="check" size={18} className="text-primary shrink-0" />}
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('sharedExpense.pickCategory')}>
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          data-testid="danh-muc-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('sharedExpense.searchCategory')}
          aria-label={t('sharedExpense.searchCategory')}
          className="text-base"
        />

        <div data-testid="danh-muc-list" className="flex flex-col divide-y divide-border">
          <button
            type="button"
            data-testid="danh-muc-clear"
            aria-pressed={value === null}
            onClick={() => handleSelect(null)}
            className={cn(
              'min-h-11 flex items-center gap-3 px-2 py-2 text-left text-base font-medium text-muted-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              value === null && 'text-primary font-semibold',
            )}
          >
            <span className="size-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <Icon name="x" size={18} />
            </span>
            <span className="flex-1 truncate">{t('sharedExpense.clearCategory')}</span>
            {value === null && <Icon name="check" size={18} className="text-primary shrink-0" />}
          </button>

          {filtered.searching ? (
            filtered.flat.map((item) => renderRow(item, false))
          ) : (
            <>
              {filtered.groups.map((group) => (
                <div
                  key={`${group.parent.value.kind}:${group.parent.id}`}
                  data-testid={`danh-muc-group-${group.parent.id}`}
                  className="flex flex-col"
                >
                  {renderRow(group.parent, false)}
                  {group.children.map((child) => renderRow(child, true))}
                </div>
              ))}
              {filtered.orphans.map((item) => renderRow(item, false))}
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
