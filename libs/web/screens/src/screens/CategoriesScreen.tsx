import { useEffect, useMemo, useState, type JSX } from 'react';
import { isCategoryVisibleIn, type CategoryView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { ApiClientError } from '@cc/web-data-access/client';
import { useLedger } from '@cc/web-data-access/people';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  useWalletDetails,
  type UpdateCategoryInput,
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
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@cc/web-ui/components/ui/native-select';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@cc/web-ui/components/ui/tabs';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { categoryIconName, filterCategoryIcons } from '../components/categoryIcon';
import { ItemWalletsRow } from '../components/visibility/ItemWalletsRow';

interface CategoryFormSheetProps {
  open: boolean;
  onClose(): void;
  type: 'expense' | 'income';
  editing: CategoryView | null;
  parents: CategoryView[];
  allCategories: CategoryView[];
  editingChildCount: number;
  onSaved?: (toastMessage?: string) => void;
}

function CategoryFormSheet({
  open,
  onClose,
  type,
  editing,
  parents,
  allCategories,
  editingChildCount,
  onSaved,
}: CategoryFormSheetProps): JSX.Element {
  const t = useT();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const walletsQuery = useWalletDetails({ enabled: Boolean(editing) });

  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState<IconName>(
    editing ? categoryIconName(editing.icon, editing.type) : type === 'income' ? 'wallet' : 'receipt',
  );
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? '');
  const [iconSheetOpen, setIconSheetOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [parentSheetOpen, setParentSheetOpen] = useState(false);

  const filteredIcons = useMemo(() => filterCategoryIcons(iconSearch), [iconSearch]);
  const eligibleParents = useMemo(
    () => parents.filter((p) => !editing || p.id !== editing.id),
    [parents, editing],
  );
  const selectedParent = eligibleParents.find((p) => p.id === parentId) ?? null;

  const activeWallets = useMemo(
    () => (walletsQuery.data?.wallets ?? []).filter((w) => !w.archived),
    [walletsQuery.data?.wallets],
  );

  const liveEditing = useMemo(
    () => (editing ? (allCategories.find((c) => c.id === editing.id) ?? editing) : null),
    [editing, allCategories],
  );

  const nextParentId = parentId || null;
  const parentChanged = editing !== null && nextParentId !== (editing.parentId ?? null);

  const parentLockedReason = editing
    ? editingChildCount > 0
      ? t('categories.parentLockedHasChildren', { count: editingChildCount })
      : editing.parentId === null && eligibleParents.length === 0
        ? t('categories.parentNoOtherParents')
        : null
    : null;

  const visibilityShifts = useMemo(() => {
    if (!liveEditing || editingChildCount > 0 || !parentChanged || activeWallets.length === 0) {
      return [];
    }
    const hypothetical: CategoryView = { ...liveEditing, parentId: nextParentId };
    const shifts: Array<{ walletName: string; becomesVisible: boolean }> = [];
    for (const w of activeWallets) {
      const wallet = { id: w.id, kind: w.kind };
      const before = isCategoryVisibleIn(liveEditing, allCategories, wallet);
      const after = isCategoryVisibleIn(hypothetical, allCategories, wallet);
      if (before !== after) {
        shifts.push({ walletName: w.name, becomesVisible: after });
      }
    }
    return shifts;
  }, [liveEditing, editingChildCount, parentChanged, activeWallets, allCategories, nextParentId]);

  const busy = createCategory.isPending || updateCategory.isPending;
  const error = editing ? updateCategory.error : createCategory.error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (editing) {
      const input: UpdateCategoryInput = { name: trimmed, icon };
      if (parentChanged) {
        input.parentId = nextParentId;
      }
      await updateCategory.mutateAsync({
        id: editing.id,
        input,
      });
      let toastMessage: string | undefined;
      if (parentChanged) {
        toastMessage =
          nextParentId === null
            ? t('categories.promotedToast', { name: trimmed })
            : t('categories.movedToParentToast', {
                name: trimmed,
                parent: selectedParent?.name ?? '',
              });
      }
      onSaved?.(toastMessage);
    } else {
      await createCategory.mutateAsync({
        type,
        name: trimmed,
        icon,
        parentId: parentId || null,
      });
      onSaved?.();
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

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t('categories.parent')}</span>
          {parentLockedReason ? (
            <>
              <div
                data-testid="category-parent-locked"
                aria-disabled="true"
                className="min-h-11 rounded-xl border border-border bg-muted/50 px-3 py-2 flex items-center text-base text-muted-foreground"
              >
                <span className="truncate">{t('categories.noParent')}</span>
              </div>
              <p className="m-0 text-sm text-muted-foreground">{parentLockedReason}</p>
            </>
          ) : (
            <button
              type="button"
              data-testid="category-parent-trigger"
              onClick={() => setParentSheetOpen(true)}
              className="min-h-11 rounded-xl border border-border bg-card px-3 py-2 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {selectedParent && (
                  <span className="size-8 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                    <Icon name={categoryIconName(selectedParent.icon, type)} size={16} />
                  </span>
                )}
                <span className="text-base text-foreground truncate">
                  {selectedParent ? selectedParent.name : t('categories.noParent')}
                </span>
              </span>
              <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
            </button>
          )}
          {visibilityShifts.length > 0 && (
            <div
              data-testid="category-parent-visibility-note"
              className="rounded-xl bg-secondary px-3 py-2.5 text-sm text-secondary-foreground flex items-start gap-2"
            >
              <Icon name="info" size={16} className="shrink-0 mt-0.5" />
              <span>
                {t('categories.visibilityShiftNote', {
                  wallets: visibilityShifts
                    .map((s) =>
                      t(
                        s.becomesVisible
                          ? 'categories.visibilityShiftShow'
                          : 'categories.visibilityShiftHide',
                        { wallet: s.walletName },
                      ),
                    )
                    .join(', '),
                })}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{t('categories.icon')}</span>
          <button
            type="button"
            data-testid="category-icon-trigger"
            onClick={() => {
              setIconSearch('');
              setIconSheetOpen(true);
            }}
            className="min-h-11 rounded-xl border border-border bg-card px-3 py-2 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-muted/50"
          >
            <span className="flex items-center gap-2.5">
              <span className="size-9 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                <Icon name={icon} size={20} />
              </span>
              <span className="text-base text-foreground">{icon}</span>
            </span>
            <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
          </button>
        </div>

        {editing && <ItemWalletsRow kind="category" item={editing} />}

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

      <Sheet
        open={iconSheetOpen}
        onClose={() => setIconSheetOpen(false)}
        title={t('categories.pickIcon')}
      >
        <div className="flex flex-col gap-3">
          <Input
            type="search"
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            placeholder={t('categories.iconSearch')}
            data-testid="category-icon-search"
            className="min-h-11 text-base"
          />
          {filteredIcons.length === 0 ? (
            <p className="m-0 py-4 text-center text-sm text-muted-foreground">
              {t('categories.noIconResults')}
            </p>
          ) : (
            <div data-testid="category-icon-grid" className="grid grid-cols-5 gap-2">
              {filteredIcons.map((iconName) => {
                const selected = icon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    aria-label={iconName}
                    aria-pressed={selected}
                    data-testid={`category-icon-option-${iconName}`}
                    onClick={() => {
                      setIcon(iconName);
                      setIconSheetOpen(false);
                    }}
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
          )}
        </div>
      </Sheet>

      <Sheet
        open={parentSheetOpen}
        onClose={() => setParentSheetOpen(false)}
        title={t('categories.pickParent')}
      >
        <div data-testid="category-parent-list" className="flex flex-col divide-y divide-border">
          <button
            type="button"
            data-testid="category-parent-option-none"
            onClick={() => {
              setParentId('');
              setParentSheetOpen(false);
            }}
            className={cn(
              'min-h-11 flex items-center justify-between gap-3 px-2 py-2.5 text-left text-base text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              parentId === '' && 'font-semibold text-primary',
            )}
          >
            <span>{t('categories.noParent')}</span>
            {parentId === '' && <Icon name="check" size={18} className="text-primary shrink-0" />}
          </button>
          {eligibleParents.map((p) => {
            const selected = parentId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                data-testid={`category-parent-option-${p.id}`}
                onClick={() => {
                  setParentId(p.id);
                  setParentSheetOpen(false);
                }}
                className={cn(
                  'min-h-11 flex items-center gap-3 px-2 py-2.5 text-left text-base text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  p.hidden && 'opacity-60',
                  selected && 'font-semibold text-primary',
                )}
              >
                <span className="size-9 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                  <Icon name={categoryIconName(p.icon, type)} size={18} />
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                {p.hidden && <Pill tone="neutral">{t('categories.hiddenBadge')}</Pill>}
                {selected && <Icon name="check" size={18} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </Sheet>
    </Sheet>
  );
}

interface DeleteParentState {
  category: CategoryView;
  children: CategoryView[];
  mode: 'promote' | 'move';
  targetParentId: string;
  directTxCount: number | null;
  moveToId: string;
  error: unknown;
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
  const [deleteParentState, setDeleteParentState] = useState<DeleteParentState | null>(null);
  const [mergeSource, setMergeSource] = useState<CategoryView | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<{ from: CategoryView; to: CategoryView } | null>(
    null,
  );
  const [mergeError, setMergeError] = useState<unknown>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const allCategories = categoriesQuery.data?.categories ?? [];
  const isFixed = (cat: CategoryView): boolean => Boolean(cat.systemKey);

  // Every hidden category, built-in or own, sits in "Đã ẩn" below the list; a hidden parent takes its
  // sub-categories with it, and a hidden sub-category of a shown parent is listed there on its own.
  const { parents, visibleParents, childrenByParent, hiddenParents, hiddenSubs } = useMemo(() => {
    const filtered = allCategories.filter((c) => c.type === type);
    const byOrder = (a: CategoryView, b: CategoryView) => a.sortOrder - b.sortOrder;

    const allParentList = filtered.filter((c) => c.parentId === null).sort(byOrder);
    const hiddenParentIds = new Set(allParentList.filter((c) => c.hidden).map((c) => c.id));

    const childMap = new Map<string, CategoryView[]>();
    const hiddenSubList: CategoryView[] = [];
    for (const c of filtered) {
      if (c.parentId === null) continue;
      if (c.hidden && !hiddenParentIds.has(c.parentId)) {
        hiddenSubList.push(c);
        continue;
      }
      const arr = childMap.get(c.parentId) ?? [];
      arr.push(c);
      childMap.set(c.parentId, arr);
    }
    for (const arr of childMap.values()) arr.sort(byOrder);
    return {
      parents: allParentList,
      visibleParents: allParentList.filter((c) => !c.hidden),
      childrenByParent: childMap,
      hiddenParents: allParentList.filter((c) => c.hidden),
      hiddenSubs: hiddenSubList.sort(byOrder),
    };
  }, [allCategories, type]);

  const mergeTargets = useMemo(() => {
    if (!mergeSource) return [];
    return allCategories
      .filter((c) => Boolean(c.systemKey) && c.type === mergeSource.type)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [allCategories, mergeSource]);

  const moveTargets = useMemo(() => {
    if (!inUseState) return [];
    const target = inUseState.category;
    return allCategories.filter(
      (c) => c.type === target.type && c.id !== target.id && c.parentId !== target.id,
    );
  }, [allCategories, inUseState]);

  const deleteParentOtherParents = useMemo(() => {
    if (!deleteParentState) return [];
    return allCategories
      .filter(
        (c) =>
          c.type === deleteParentState.category.type &&
          c.parentId === null &&
          c.id !== deleteParentState.category.id,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [allCategories, deleteParentState]);

  const deleteParentTxTargets = useMemo(() => {
    if (!deleteParentState) return [];
    return allCategories
      .filter(
        (c) =>
          c.type === deleteParentState.category.type &&
          c.id !== deleteParentState.category.id,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [allCategories, deleteParentState]);

  const openAdd = () => {
    setFormKey((k) => k + 1);
    setFormState({ open: true, editing: null });
  };

  const openEdit = (cat: CategoryView) => {
    setFormKey((k) => k + 1);
    setFormState({ open: true, editing: cat });
  };

  const openDeleteParent = (cat: CategoryView, kids: CategoryView[], directCount: number | null = null) => {
    const otherParentList = allCategories
      .filter((c) => c.type === cat.type && c.parentId === null && c.id !== cat.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const fallbackMoveTarget = allCategories
      .filter((c) => c.type === cat.type && c.id !== cat.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];
    setDeleteParentState({
      category: cat,
      children: kids,
      mode: 'promote',
      targetParentId: otherParentList[0]?.id ?? '',
      directTxCount: directCount,
      moveToId: fallbackMoveTarget?.id ?? '',
      error: null,
    });
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
          const refetched = await categoriesQuery.refetch();
          const latestCats = refetched.data?.categories ?? allCategories;
          const kids = latestCats
            .filter((c) => c.parentId === cat.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const otherParentList = latestCats
            .filter((c) => c.type === cat.type && c.parentId === null && c.id !== cat.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const fallbackMoveTarget = latestCats
            .filter((c) => c.type === cat.type && c.id !== cat.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)[0];
          const count =
            typeof err.details.count === 'number' && err.details.count > 0
              ? err.details.count
              : null;
          setDeleteParentState({
            category: cat,
            children: kids,
            mode: 'promote',
            targetParentId: otherParentList[0]?.id ?? '',
            directTxCount: count,
            moveToId: fallbackMoveTarget?.id ?? '',
            error: null,
          });
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

  const handleConfirmDeleteParent = async () => {
    if (!deleteParentState) return;
    const { category, children, mode, targetParentId, directTxCount, moveToId: txMoveToId } =
      deleteParentState;
    const childrenArg = mode === 'promote' ? 'promote' : targetParentId;
    if (!childrenArg) return;
    if (directTxCount !== null && directTxCount > 0 && !txMoveToId) return;

    setDeleteParentState((prev) => (prev ? { ...prev, error: null } : null));
    try {
      await deleteCategory.mutateAsync({
        id: category.id,
        children: childrenArg,
        moveTo: directTxCount !== null && directTxCount > 0 ? txMoveToId : undefined,
      });
      const childCount = children.length;
      const toastMsg =
        mode === 'promote'
          ? t('categories.deletedParentPromotedToast', {
              name: category.name,
              count: childCount,
            })
          : t('categories.deletedParentMovedToast', {
              name: category.name,
              count: childCount,
              parent: deleteParentOtherParents.find((p) => p.id === targetParentId)?.name ?? '',
            });
      setDeleteParentState(null);
      setToast(toastMsg);
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        err.status === 409 &&
        err.code === 'IN_USE' &&
        typeof err.details.count === 'number' &&
        err.details.count > 0
      ) {
        const count = err.details.count;
        const fallbackMove = deleteParentTxTargets[0]?.id ?? '';
        setDeleteParentState((prev) =>
          prev
            ? {
                ...prev,
                directTxCount: count,
                moveToId: prev.moveToId || fallbackMove,
                error: null,
              }
            : null,
        );
        return;
      }
      setDeleteParentState((prev) => (prev ? { ...prev, error: err } : null));
    }
  };

  const handleHideParentInstead = async () => {
    if (!deleteParentState) return;
    try {
      await updateCategory.mutateAsync({
        id: deleteParentState.category.id,
        input: { hidden: true },
      });
      setDeleteParentState(null);
    } catch (err) {
      setDeleteParentState((prev) => (prev ? { ...prev, error: err } : null));
    }
  };

  const handleConfirmMerge = async () => {
    if (!mergeConfirm) return;
    setMergeError(null);
    try {
      await deleteCategory.mutateAsync({
        id: mergeConfirm.from.id,
        moveTo: mergeConfirm.to.id,
      });
      setMergeConfirm(null);
    } catch (err) {
      setMergeError(err);
    }
  };

  const renderRow = (cat: CategoryView, isSub: boolean) => {
    const fixed = isFixed(cat);
    const actions: RowAction[] = fixed
      ? []
      : [
          {
            id: 'edit',
            label: t('categories.edit'),
            icon: 'edit',
            onSelect: () => openEdit(cat),
          },
          {
            id: 'toggle-hidden',
            label: cat.hidden ? t('categories.show') : t('categories.hide'),
            icon: cat.hidden ? 'eye' : 'eye-off',
            onSelect: () => {
              void updateCategory.mutate({ id: cat.id, input: { hidden: !cat.hidden } });
            },
          },
          {
            id: 'delete',
            label: t('categories.delete'),
            icon: 'trash',
            tone: 'danger',
            onSelect: () => {
              const kids = childrenByParent.get(cat.id) ?? [];
              if (kids.length > 0) {
                openDeleteParent(cat, kids);
              } else {
                setConfirmDelete(cat);
              }
            },
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
          onOpen={fixed ? undefined : () => openEdit(cat)}
          leading={
            <div className="size-9 rounded-lg bg-muted grid place-items-center shrink-0 text-foreground">
              <Icon name={categoryIconName(cat.icon, cat.type)} size={18} />
            </div>
          }
          trailing={
            <div className="flex items-center gap-1 min-h-11">
              {fixed ? (
                <span
                  role="img"
                  aria-label={t('categories.builtIn')}
                  title={t('categories.builtIn')}
                  className="inline-flex items-center px-1 text-muted-foreground shrink-0"
                >
                  <Icon name="shield" size={14} />
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={t('categories.mergeInto')}
                    title={t('categories.mergeInto')}
                    data-testid={`category-merge-${cat.id}`}
                    onClick={() => {
                      setMergeError(null);
                      setMergeSource(cat);
                    }}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer border-0 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon name="merge" size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={t('categories.editAria', { name: cat.name })}
                    data-testid={`category-edit-${cat.id}`}
                    onClick={() => openEdit(cat)}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer border-0 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon name="edit" size={18} />
                  </button>
                </>
              )}
              <span className="inline-flex min-h-11 items-center pl-1">
                <Switch
                  checked={!cat.hidden}
                  aria-label={
                    cat.hidden
                      ? t('categories.showAria', { name: cat.name })
                      : t('categories.hideAria', { name: cat.name })
                  }
                  data-testid={`category-hide-${cat.id}`}
                  onCheckedChange={(checked) => {
                    void updateCategory.mutate({ id: cat.id, input: { hidden: !checked } });
                  }}
                />
              </span>
            </div>
          }
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
          className="gap-0"
        >
          <TabsList
            aria-label={t('categories.tabs')}
            className="flex bg-muted rounded-full p-1 gap-1 h-auto w-full"
          >
            <TabsTrigger
              value="expense"
              className="flex-1 min-w-0 min-h-11 rounded-full px-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
            >
              {t('personalEntry.expense')}
            </TabsTrigger>
            <TabsTrigger
              value="income"
              className="flex-1 min-w-0 min-h-11 rounded-full px-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
            >
              {t('personalEntry.income')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {categoriesQuery.isPending ? (
          <SkeletonList rows={5} />
        ) : categoriesQuery.error ? (
          <InlineError error={categoriesQuery.error} onRetry={() => categoriesQuery.refetch()} />
        ) : parents.length === 0 && hiddenSubs.length === 0 ? (
          <EmptyState
            icon="pie"
            title={t('categories.emptyTitle')}
            body={t('categories.emptyBody')}
          />
        ) : (
          <SwipeGroupProvider>
            {visibleParents.length > 0 && (
              <div className="fsl-categories__list bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {visibleParents.map((parent) => {
                  const subs = childrenByParent.get(parent.id) ?? [];
                  return (
                    <div key={parent.id} className="divide-y divide-border">
                      {renderRow(parent, false)}
                      {subs.map((sub) => renderRow(sub, true))}
                    </div>
                  );
                })}
              </div>
            )}
            {(hiddenParents.length > 0 || hiddenSubs.length > 0) && (
              <section data-testid="categories-hidden-section" className="flex flex-col gap-2">
                <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                  {t('categories.hiddenSection')}
                </h2>
                <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {hiddenParents.map((parent) => (
                    <div key={parent.id} className="divide-y divide-border">
                      {renderRow(parent, false)}
                      {(childrenByParent.get(parent.id) ?? []).map((sub) => renderRow(sub, true))}
                    </div>
                  ))}
                  {hiddenSubs.map((cat) => renderRow(cat, false))}
                </div>
              </section>
            )}
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
          allCategories={allCategories}
          editingChildCount={
            formState.editing ? (childrenByParent.get(formState.editing.id)?.length ?? 0) : 0
          }
          onSaved={(msg) => {
            if (msg) setToast(msg);
          }}
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

      <Sheet
        open={deleteParentState !== null}
        onClose={() => setDeleteParentState(null)}
        title={
          deleteParentState
            ? t('categories.deleteParentTitle', { name: deleteParentState.category.name })
            : ''
        }
      >
        {deleteParentState && (
          <div data-testid="delete-parent-sheet" className="flex flex-col gap-4">
            <p className="m-0 text-sm text-muted-foreground">
              {t('categories.deleteParentBody', { count: deleteParentState.children.length })}
            </p>

            {deleteParentState.children.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {deleteParentState.children.slice(0, 5).map((child) => (
                  <Pill key={child.id} tone="neutral">
                    {child.name}
                  </Pill>
                ))}
                {deleteParentState.children.length > 5 && (
                  <Pill tone="neutral">
                    {t('categories.deleteParentMoreChildren', {
                      count: deleteParentState.children.length - 5,
                    })}
                  </Pill>
                )}
              </div>
            )}

            <div
              role="radiogroup"
              aria-label={t('categories.deleteParentBody', {
                count: deleteParentState.children.length,
              })}
              className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden"
            >
              <button
                type="button"
                role="radio"
                aria-checked={deleteParentState.mode === 'promote'}
                data-testid="delete-parent-mode-promote"
                onClick={() =>
                  setDeleteParentState((prev) =>
                    prev ? { ...prev, mode: 'promote', error: null } : null,
                  )
                }
                className="min-h-11 w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer bg-transparent border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex flex-col gap-0.5">
                  <span
                    className={cn(
                      'text-base font-medium text-foreground',
                      deleteParentState.mode === 'promote' && 'text-primary font-semibold',
                    )}
                  >
                    {t('categories.promoteChildren')}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t('categories.promoteChildrenDesc')}
                  </span>
                </div>
                {deleteParentState.mode === 'promote' && (
                  <Icon name="check" size={18} className="text-primary shrink-0" />
                )}
              </button>

              {deleteParentOtherParents.length > 0 && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={deleteParentState.mode === 'move'}
                  data-testid="delete-parent-mode-move"
                  onClick={() =>
                    setDeleteParentState((prev) =>
                      prev
                        ? {
                            ...prev,
                            mode: 'move',
                            targetParentId:
                              prev.targetParentId || deleteParentOtherParents[0]?.id || '',
                            error: null,
                          }
                        : null,
                    )
                  }
                  className="min-h-11 w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer bg-transparent border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'text-base font-medium text-foreground',
                      deleteParentState.mode === 'move' && 'text-primary font-semibold',
                    )}
                  >
                    {t('categories.moveChildrenToParent')}
                  </span>
                  {deleteParentState.mode === 'move' && (
                    <Icon name="check" size={18} className="text-primary shrink-0" />
                  )}
                </button>
              )}
            </div>

            {deleteParentState.mode === 'move' && deleteParentOtherParents.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delete-parent-target-select">
                  {t('categories.moveChildrenTargetLabel')}
                </Label>
                <NativeSelect
                  id="delete-parent-target-select"
                  value={deleteParentState.targetParentId}
                  onChange={(e) =>
                    setDeleteParentState((prev) =>
                      prev ? { ...prev, targetParentId: e.target.value } : null,
                    )
                  }
                  data-testid="delete-parent-target-select"
                  className="w-full min-h-11 text-base"
                >
                  {deleteParentOtherParents.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}

            {deleteParentState.directTxCount !== null && deleteParentState.directTxCount > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delete-parent-tx-move-select">
                  {t('categories.deleteParentDirectTx', {
                    name: deleteParentState.category.name,
                    count: deleteParentState.directTxCount,
                  })}
                </Label>
                <NativeSelect
                  id="delete-parent-tx-move-select"
                  value={deleteParentState.moveToId}
                  onChange={(e) =>
                    setDeleteParentState((prev) =>
                      prev ? { ...prev, moveToId: e.target.value } : null,
                    )
                  }
                  data-testid="delete-parent-tx-move-select"
                  className="w-full min-h-11 text-base"
                >
                  {deleteParentTxTargets.map((target) => (
                    <NativeSelectOption key={target.id} value={target.id}>
                      {target.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}

            {Boolean(deleteParentState.error) && <InlineError error={deleteParentState.error} />}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="danger"
                block
                disabled={
                  (deleteParentState.mode === 'move' && !deleteParentState.targetParentId) ||
                  (deleteParentState.directTxCount !== null &&
                    deleteParentState.directTxCount > 0 &&
                    !deleteParentState.moveToId)
                }
                loading={deleteCategory.isPending}
                data-testid="delete-parent-confirm"
                onClick={() => void handleConfirmDeleteParent()}
              >
                {t('categories.moveChildrenAndDelete')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                block
                loading={updateCategory.isPending}
                data-testid="delete-parent-hide-instead"
                onClick={() => void handleHideParentInstead()}
              >
                {t('categories.hideInstead')}
              </Button>
            </div>
          </div>
        )}
      </Sheet>

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
      <Sheet
        open={mergeSource !== null}
        onClose={() => setMergeSource(null)}
        title={mergeSource ? t('categories.mergeTitle', { name: mergeSource.name }) : ''}
      >
        {mergeTargets.length === 0 ? (
          <p className="m-0 py-4 text-center text-sm text-muted-foreground">
            {t('categories.mergeEmpty')}
          </p>
        ) : (
          <div data-testid="merge-target-list" className="flex flex-col divide-y divide-border">
            {mergeTargets.map((target) => (
              <button
                key={target.id}
                type="button"
                data-testid={`merge-target-${target.id}`}
                onClick={() => {
                  if (!mergeSource) return;
                  setMergeError(null);
                  setMergeConfirm({ from: mergeSource, to: target });
                  setMergeSource(null);
                }}
                className="min-h-11 flex items-center gap-3 px-2 py-2.5 text-left text-base text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="size-9 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                  <Icon name={categoryIconName(target.icon, target.type)} size={18} />
                </span>
                <span className="flex-1 truncate">{target.name}</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <Modal
        open={mergeConfirm !== null}
        onClose={() => {
          setMergeError(null);
          setMergeConfirm(null);
        }}
        title={t('categories.mergeConfirmTitle')}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">
            {mergeConfirm
              ? t('categories.mergeConfirmBody', {
                  from: mergeConfirm.from.name,
                  to: mergeConfirm.to.name,
                })
              : ''}
          </p>
          {Boolean(mergeError) && <InlineError error={mergeError} />}
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                setMergeError(null);
                setMergeConfirm(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              data-testid="category-merge-confirm"
              loading={deleteCategory.isPending}
              onClick={() => void handleConfirmMerge()}
            >
              {t('categories.mergeConfirmAction')}
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Snackbar message={toast} />}
    </Screen>
  );
}
