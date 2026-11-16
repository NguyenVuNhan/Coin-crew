import { useMemo, useState, type JSX } from 'react';
import type { CategoryView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { ApiClientError } from '@cc/web-data-access/client';
import { useLedger } from '@cc/web-data-access/people';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@cc/web-data-access/personalMoney';
import { SwipeGroupProvider } from '@cc/web-util/useSwipeReveal';
import { ActionRow, type RowAction } from '@cc/web-ui/components/ActionRow';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Pill } from '@cc/web-ui/components/Pill';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@cc/web-ui/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@cc/web-ui/components/ui/tabs';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';

const CATEGORY_ICONS: readonly IconName[] = [
  'receipt',
  'wallet',
  'bank',
  'pie',
  'piggyBank',
  'home',
  'users',
  'star',
  'crown',
  'trophy',
  'shield',
  'suitcase',
  'calendar',
  'smartphone',
  'palette',
];

const KNOWN_ICON_MAP: Record<string, IconName> = {
  home: 'home',
  wallet: 'wallet',
  receipt: 'receipt',
  bank: 'bank',
  landmark: 'bank',
  pie: 'pie',
  'pie-chart': 'pie',
  piggyBank: 'piggyBank',
  'piggy-bank': 'piggyBank',
  users: 'users',
  user: 'user',
  calendar: 'calendar',
  clock: 'clock',
  star: 'star',
  crown: 'crown',
  trophy: 'trophy',
  shield: 'shield',
  swap: 'swap',
  camera: 'camera',
  smartphone: 'smartphone',
  settings: 'settings',
  map: 'map',
  suitcase: 'suitcase',
  bell: 'bell',
  palette: 'palette',
};

function resolveCategoryIcon(icon: string, type: 'expense' | 'income'): IconName {
  return KNOWN_ICON_MAP[icon] ?? (type === 'income' ? 'wallet' : 'receipt');
}

interface CategoryFormSheetProps {
  open: boolean;
  onClose(): void;
  type: 'expense' | 'income';
  editing: CategoryView | null;
  parents: CategoryView[];
}

function CategoryFormSheet({
  open,
  onClose,
  type,
  editing,
  parents,
}: CategoryFormSheetProps): JSX.Element {
  const t = useT();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState<IconName>(
    editing ? resolveCategoryIcon(editing.icon, editing.type) : type === 'income' ? 'wallet' : 'receipt',
  );
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? '');

  const busy = createCategory.isPending || updateCategory.isPending;
  const error = editing ? updateCategory.error : createCategory.error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (editing) {
      await updateCategory.mutateAsync({
        id: editing.id,
        input: { name: trimmed, icon },
      });
    } else {
      await createCategory.mutateAsync({
        type,
        name: trimmed,
        icon,
        parentId: parentId || null,
      });
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? t('categories.editTitle') : t('categories.newTitle')}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category-name-input">{t('categories.name')}</Label>
          <Input
            id="category-name-input"
            type="text"
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="category-name-input"
            className="min-h-11 text-base"
          />
        </div>

        {!editing && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-parent-select">{t('categories.parent')}</Label>
            <NativeSelect
              id="category-parent-select"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              data-testid="category-parent-select"
              className="w-full min-h-11 text-base"
            >
              <NativeSelectOption value="">{t('categories.noParent')}</NativeSelectOption>
              {parents.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t('categories.icon')}</span>
          <div className="grid grid-cols-5 gap-2">
            {CATEGORY_ICONS.map((iconName) => {
              const selected = icon === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  aria-label={iconName}
                  aria-pressed={selected}
                  onClick={() => setIcon(iconName)}
                  className={cn(
                    'min-h-11 rounded-xl border grid place-items-center transition-colors cursor-pointer',
                    selected
                      ? 'border-primary bg-secondary text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon name={iconName} size={20} />
                </button>
              );
            })}
          </div>
        </div>

        {error && <InlineError error={error} />}

        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!name.trim()}
            loading={busy}
            data-testid="category-save-btn"
          >
            {t('categories.save')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function CategoriesScreen(): JSX.Element {
  const t = useT();
  const { ledger } = useLedger();
  const categoriesQuery = useCategories();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [formState, setFormState] = useState<{ open: boolean; editing: CategoryView | null }>({
    open: false,
    editing: null,
  });
  const [formKey, setFormKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<CategoryView | null>(null);
  const [inUseState, setInUseState] = useState<{ category: CategoryView; count: number } | null>(null);
  const [moveToId, setMoveToId] = useState('');
  const [hasChildrenCat, setHasChildrenCat] = useState<CategoryView | null>(null);

  const allCategories = categoriesQuery.data?.categories ?? [];

  const { parents, childrenByParent } = useMemo(() => {
    const filtered = allCategories.filter((c) => c.type === type);
    const parentList = filtered
      .filter((c) => c.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const childMap = new Map<string, CategoryView[]>();
    for (const c of filtered) {
      if (c.parentId !== null) {
        const arr = childMap.get(c.parentId) ?? [];
        arr.push(c);
        childMap.set(c.parentId, arr);
      }
    }
    for (const arr of childMap.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return { parents: parentList, childrenByParent: childMap };
  }, [allCategories, type]);

  const moveTargets = useMemo(() => {
    if (!inUseState) return [];
    const target = inUseState.category;
    return allCategories.filter(
      (c) => c.type === target.type && c.id !== target.id && c.parentId !== target.id,
    );
  }, [allCategories, inUseState]);

  const openAdd = () => {
    setFormKey((k) => k + 1);
    setFormState({ open: true, editing: null });
  };

  const openEdit = (cat: CategoryView) => {
    setFormKey((k) => k + 1);
    setFormState({ open: true, editing: cat });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const cat = confirmDelete;
    try {
      await deleteCategory.mutateAsync({ id: cat.id });
      setConfirmDelete(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409 && err.code === 'IN_USE') {
        setConfirmDelete(null);
        if (err.details.reason === 'HAS_CHILDREN') {
          setHasChildrenCat(cat);
        } else {
          const count = typeof err.details.count === 'number' ? err.details.count : 0;
          const firstTarget = allCategories.find(
            (c) => c.type === cat.type && c.id !== cat.id && c.parentId !== cat.id,
          );
          setMoveToId(firstTarget?.id ?? '');
          setInUseState({ category: cat, count });
        }
      }
    }
  };

  const handleMoveAndDelete = async () => {
    if (!inUseState || !moveToId) return;
    await deleteCategory.mutateAsync({ id: inUseState.category.id, moveTo: moveToId });
    setInUseState(null);
  };

  const handleHideInstead = async () => {
    if (!inUseState) return;
    await updateCategory.mutateAsync({ id: inUseState.category.id, input: { hidden: true } });
    setInUseState(null);
  };

  const renderRow = (cat: CategoryView, isSub: boolean) => {
    const actions: RowAction[] = [
      {
        id: 'edit',
        label: t('categories.edit'),
        icon: 'edit',
        onSelect: () => openEdit(cat),
      },
      {
        id: 'toggle-hidden',
        label: cat.hidden ? t('categories.show') : t('categories.hide'),
        icon: cat.hidden ? 'check' : 'ban',
        onSelect: () => {
          void updateCategory.mutate({ id: cat.id, input: { hidden: !cat.hidden } });
        },
      },
      {
        id: 'delete',
        label: t('categories.delete'),
        icon: 'trash',
        tone: 'danger',
        onSelect: () => setConfirmDelete(cat),
      },
    ];

    return (
      <div
        key={cat.id}
        data-testid={`category-row-${cat.id}`}
        className={cn(isSub && 'pl-10', cat.hidden && 'opacity-60')}
      >
        <ActionRow
          label={cat.name}
          actions={actions}
          leading={
            <div className="size-9 rounded-lg bg-muted grid place-items-center shrink-0 text-foreground">
              <Icon name={resolveCategoryIcon(cat.icon, cat.type)} size={18} />
            </div>
          }
          trailing={cat.hidden ? <Pill tone="neutral">{t('categories.hiddenBadge')}</Pill> : undefined}
        >
          <span className="text-sm font-medium text-foreground truncate">{cat.name}</span>
        </ActionRow>
      </div>
    );
  };

  return (
    <Screen
      title={t('categories.title')}
      back="/trips"
      nav={ledger ? { section: 'home', addHref: `/t/${ledger.tripId}/expenses/new` } : undefined}
    >
      <div className="fsl-categories flex flex-col gap-4 py-4">
        <Tabs
          value={type}
          onValueChange={(v) => setType(v as 'expense' | 'income')}
        >
          <TabsList className="grid grid-cols-2 w-full" aria-label={t('categories.tabs')}>
            <TabsTrigger value="expense" className="min-h-11">
              {t('personalEntry.expense')}
            </TabsTrigger>
            <TabsTrigger value="income" className="min-h-11">
              {t('personalEntry.income')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {categoriesQuery.isPending ? (
          <SkeletonList rows={5} />
        ) : categoriesQuery.error ? (
          <InlineError error={categoriesQuery.error} onRetry={() => categoriesQuery.refetch()} />
        ) : parents.length === 0 ? (
          <EmptyState
            icon="pie"
            title={t('categories.emptyTitle')}
            body={t('categories.emptyBody')}
          />
        ) : (
          <SwipeGroupProvider>
            <div className="fsl-categories__list bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
              {parents.map((parent) => {
                const subs = childrenByParent.get(parent.id) ?? [];
                return (
                  <div key={parent.id} className="divide-y divide-border">
                    {renderRow(parent, false)}
                    {subs.map((sub) => renderRow(sub, true))}
                  </div>
                );
              })}
            </div>
          </SwipeGroupProvider>
        )}

        <Button
          variant="secondary"
          block
          data-testid="category-add-btn"
          onClick={openAdd}
        >
          <Icon name="plus" size={18} />
          {t('categories.add')}
        </Button>
      </div>

      {formState.open && (
        <CategoryFormSheet
          key={formKey}
          open={formState.open}
          onClose={() => setFormState({ open: false, editing: null })}
          type={type}
          editing={formState.editing}
          parents={parents}
        />
      )}

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={t('categories.deleteConfirmTitle')}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">
            {confirmDelete ? t('categories.deleteConfirmBody', { name: confirmDelete.name }) : ''}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              data-testid="category-delete-confirm"
              loading={deleteCategory.isPending}
              onClick={() => void handleConfirmDelete()}
            >
              {t('categories.delete')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={hasChildrenCat !== null}
        onClose={() => setHasChildrenCat(null)}
        title={hasChildrenCat?.name ?? t('categories.title')}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">{t('categories.hasChildrenError')}</p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setHasChildrenCat(null)}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Modal>

      <Sheet
        open={inUseState !== null}
        onClose={() => setInUseState(null)}
        title={inUseState ? t('categories.inUseTitle', { count: inUseState.count }) : ''}
      >
        <div className="flex flex-col gap-4">
          {moveTargets.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-move-select">{t('categories.moveToOther')}</Label>
                <NativeSelect
                  id="category-move-select"
                  value={moveToId}
                  onChange={(e) => setMoveToId(e.target.value)}
                  data-testid="category-move-select"
                  className="w-full min-h-11 text-base"
                >
                  {moveTargets.map((target) => (
                    <NativeSelectOption key={target.id} value={target.id}>
                      {target.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <Button
                variant="danger"
                block
                disabled={!moveToId}
                loading={deleteCategory.isPending}
                data-testid="category-move-confirm"
                onClick={() => void handleMoveAndDelete()}
              >
                {t('categories.moveAndDelete')}
              </Button>
            </div>
          )}

          <Button
            variant="secondary"
            block
            loading={updateCategory.isPending}
            onClick={() => void handleHideInstead()}
          >
            {t('categories.hideInstead')}
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}
