import { useMemo, useState, type JSX } from 'react';
import { assetStepText, assetUnitText, type AssetView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { ApiClientError } from '@cc/web-data-access/client';
import { useLedger } from '@cc/web-data-access/people';
import {
  useAssets,
  useDeleteAsset,
  useUpdateAsset,
} from '@cc/web-data-access/personalMoney';
import { SwipeGroupProvider } from '@cc/web-util/useSwipeReveal';
import { ActionRow, type RowAction } from '@cc/web-ui/components/ActionRow';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Pill } from '@cc/web-ui/components/Pill';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { cn } from '@cc/web-ui/lib/utils';
import { AssetForm } from '../components/AssetForm';
import { AssetIcon } from '../components/AssetIcon';
import { Screen } from '../components/Screen';

export function AssetsScreen(): JSX.Element {
  const t = useT();
  const { ledger } = useLedger();
  const assetsQuery = useAssets();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();

  const [formState, setFormState] = useState<{
    open: boolean;
    editing: AssetView | null;
  }>({
    open: false,
    editing: null,
  });
  const [formKey, setFormKey] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AssetView | null>(null);
  const [confirmDeleteError, setConfirmDeleteError] = useState<unknown>(null);
  const [inUseState, setInUseState] = useState<{
    asset: AssetView;
    count: number;
  } | null>(null);
  const [inUseError, setInUseError] = useState<unknown>(null);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const allAssets = assetsQuery.data?.assets ?? [];

  const usedGroups = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const a of allAssets) {
      if (a.groupName && !seen.has(a.groupName)) {
        seen.add(a.groupName);
        list.push(a.groupName);
      }
    }
    return list;
  }, [allAssets]);

  const { groupedActive, hiddenAssets } = useMemo(() => {
    const groups = new Map<string, AssetView[]>();
    const hidden: AssetView[] = [];
    const sorted = [...allAssets].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const asset of sorted) {
      if (asset.hidden) {
        hidden.push(asset);
      } else {
        const arr = groups.get(asset.groupName) ?? [];
        arr.push(asset);
        groups.set(asset.groupName, arr);
      }
    }
    return {
      groupedActive: Array.from(groups.entries()),
      hiddenAssets: hidden,
    };
  }, [allAssets]);

  const moveTargets = useMemo(() => {
    if (!inUseState) return [];
    const target = inUseState.asset;
    return allAssets.filter(
      (a) => !a.hidden && a.id !== target.id && a.decimals === target.decimals,
    );
  }, [allAssets, inUseState]);

  const openAdd = () => {
    setFormKey((k) => k + 1);
    setFormState({ open: true, editing: null });
  };

  const openEdit = (asset: AssetView) => {
    setFormKey((k) => k + 1);
    setFormState({ open: true, editing: asset });
  };

  const closeForm = () => {
    setFormState({ open: false, editing: null });
  };

  const requestDelete = (asset: AssetView) => {
    setActionError(null);
    if (asset.entryCount > 0) {
      setShowMovePicker(false);
      setInUseError(null);
      setInUseState({ asset, count: asset.entryCount });
    } else {
      setConfirmDeleteError(null);
      setConfirmDelete(asset);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const asset = confirmDelete;
    setConfirmDeleteError(null);
    try {
      await deleteAsset.mutateAsync({ id: asset.id });
      setConfirmDelete(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409 && err.code === 'IN_USE') {
        setConfirmDelete(null);
        const count = typeof err.details.count === 'number' ? err.details.count : asset.entryCount;
        setShowMovePicker(false);
        setInUseError(null);
        setInUseState({ asset, count });
      } else {
        setConfirmDeleteError(err);
      }
    }
  };

  const handleMoveAndDelete = async (moveToId: string) => {
    if (!inUseState) return;
    setInUseError(null);
    try {
      await deleteAsset.mutateAsync({
        id: inUseState.asset.id,
        moveTo: moveToId,
      });
      setInUseState(null);
      setShowMovePicker(false);
    } catch (err) {
      setInUseError(err);
    }
  };

  const handleHideInstead = async () => {
    if (!inUseState) return;
    setInUseError(null);
    try {
      await updateAsset.mutateAsync({
        id: inUseState.asset.id,
        input: { hidden: true },
      });
      setInUseState(null);
      setShowMovePicker(false);
    } catch (err) {
      setInUseError(err);
    }
  };

  const handleToggleHidden = async (asset: AssetView) => {
    setActionError(null);
    try {
      await updateAsset.mutateAsync({
        id: asset.id,
        input: { hidden: !asset.hidden },
      });
    } catch (err) {
      setActionError(err);
    }
  };

  const renderRow = (asset: AssetView) => {
    const actions: RowAction[] = [
      {
        id: 'delete',
        label: t('assets.delete'),
        icon: 'trash',
        tone: 'danger',
        onSelect: () => requestDelete(asset),
      },
    ];
    const step = assetStepText(asset);
    const subtitle = step.kind === 'lot' ? t('assets.stepLot', { step: step.step }) : step.unit;

    return (
      <div
        key={asset.id}
        data-testid={`asset-row-${asset.id}`}
        className={cn(asset.hidden && 'opacity-60')}
      >
        <ActionRow
          label={asset.name}
          actions={actions}
          onOpen={() => openEdit(asset)}
          openTestId={`asset-edit-${asset.id}`}
          leading={<AssetIcon asset={asset} size="sm" />}
          trailing={
            <div className="flex items-center gap-2 min-h-11">
              {asset.hidden && <Pill tone="neutral">{t('assets.hiddenBadge')}</Pill>}
              <span className="inline-flex min-h-11 items-center pl-1">
                <Switch
                  checked={!asset.hidden}
                  aria-label={
                    asset.hidden
                      ? t('assets.showAria', { name: asset.name })
                      : t('assets.hideAria', { name: asset.name })
                  }
                  data-testid={`asset-toggle-hidden-${asset.id}`}
                  onCheckedChange={() => {
                    void handleToggleHidden(asset);
                  }}
                />
              </span>
            </div>
          }
        >
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate">{asset.name}</span>
            <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
          </div>
        </ActionRow>
      </div>
    );
  };

  return (
    <Screen
      title={t('assets.title')}
      back="/trips"
      nav={ledger ? { section: 'home', addHref: `/t/${ledger.tripId}/expenses/new` } : undefined}
    >
      <div className="fsl-assets flex flex-col gap-4 py-4">
        {assetsQuery.isPending ? (
          <SkeletonList rows={5} />
        ) : assetsQuery.error ? (
          <InlineError error={assetsQuery.error} onRetry={() => assetsQuery.refetch()} />
        ) : allAssets.length === 0 ? (
          <EmptyState
            icon="coins"
            title={t('assets.emptyTitle')}
            action={
              <Button variant="primary" block data-testid="asset-add-btn" onClick={openAdd}>
                <Icon name="plus" size={18} />
                {t('assets.add')}
              </Button>
            }
          />
        ) : (
          <>
            {actionError !== null && <InlineError error={actionError} />}
            <SwipeGroupProvider>
              <div className="flex flex-col gap-4">
                {groupedActive.map(([groupName, groupAssets]) => (
                  <section key={groupName} className="flex flex-col gap-1.5">
                    <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                      {groupName}
                    </h2>
                    <div className="fsl-assets__list bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                      {groupAssets.map(renderRow)}
                    </div>
                  </section>
                ))}

                {hiddenAssets.length > 0 && (
                  <section className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      aria-expanded={showHidden}
                      data-testid="assets-hidden-toggle"
                      onClick={() => setShowHidden((v) => !v)}
                      className="min-h-11 px-1 flex items-center justify-between gap-2 text-sm font-semibold text-muted-foreground bg-transparent border-0 cursor-pointer hover:text-foreground"
                    >
                      <span>
                        {t('assets.hiddenSection')} ({hiddenAssets.length})
                      </span>
                      <Icon name={showHidden ? 'chevronUp' : 'chevronDown'} size={18} />
                    </button>
                    {showHidden && (
                      <div
                        data-testid="assets-hidden-list"
                        className="fsl-assets__hidden-list bg-card border border-border rounded-xl overflow-hidden divide-y divide-border"
                      >
                        {hiddenAssets.map(renderRow)}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </SwipeGroupProvider>

            <Button
              variant="secondary"
              block
              data-testid="asset-add-btn"
              onClick={openAdd}
            >
              <Icon name="plus" size={18} />
              {t('assets.add')}
            </Button>
          </>
        )}
      </div>

      {formState.open && (
        <Sheet
          open={formState.open}
          onClose={closeForm}
          title={formState.editing ? t('assets.editTitle') : t('assets.newTitle')}
        >
          <AssetForm
            key={formKey}
            asset={formState.editing ?? undefined}
            groups={usedGroups}
            onSaved={closeForm}
            onCancel={closeForm}
          />
        </Sheet>
      )}

      <Modal
        open={confirmDelete !== null}
        onClose={() => {
          setConfirmDelete(null);
          setConfirmDeleteError(null);
        }}
        title={t('assets.deleteConfirmTitle')}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">
            {confirmDelete ? t('assets.deleteConfirmBody', { name: confirmDelete.name }) : ''}
          </p>
          {confirmDeleteError !== null && <InlineError error={confirmDeleteError} />}
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmDelete(null);
                setConfirmDeleteError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              data-testid="asset-delete-confirm"
              loading={deleteAsset.isPending}
              onClick={() => void handleConfirmDelete()}
            >
              {t('assets.delete')}
            </Button>
          </div>
        </div>
      </Modal>

      <Sheet
        open={inUseState !== null}
        onClose={() => {
          setInUseState(null);
          setInUseError(null);
          setShowMovePicker(false);
        }}
        title={inUseState ? t('assets.inUseTitle', { count: inUseState.count }) : ''}
      >
        <div className="flex flex-col gap-3">
          {inUseError !== null && <InlineError error={inUseError} />}
          {!showMovePicker ? (
            <>
              <Button
                variant="secondary"
                block
                data-testid="asset-move-open"
                onClick={() => setShowMovePicker(true)}
              >
                {t('assets.moveToOther')}
              </Button>
              <Button
                variant="secondary"
                block
                data-testid="asset-hide-instead"
                loading={updateAsset.isPending}
                onClick={() => void handleHideInstead()}
              >
                {t('assets.hideInstead')}
              </Button>
            </>
          ) : moveTargets.length === 0 ? (
            <>
              <p
                data-testid="asset-no-move-targets"
                className="m-0 text-sm text-muted-foreground"
              >
                {t('assets.noSameDecimalsTarget')}
              </p>
              <Button
                variant="secondary"
                block
                data-testid="asset-hide-instead"
                loading={updateAsset.isPending}
                onClick={() => void handleHideInstead()}
              >
                {t('assets.hideInstead')}
              </Button>
            </>
          ) : (
            <>
              <div
                data-testid="asset-move-list"
                className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border"
              >
                {moveTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    data-testid={`asset-move-target-${target.id}`}
                    disabled={deleteAsset.isPending}
                    onClick={() => void handleMoveAndDelete(target.id)}
                    className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 text-left text-base text-foreground hover:bg-muted bg-transparent border-0 cursor-pointer disabled:opacity-50"
                  >
                    <span className="font-medium truncate">{target.name}</span>
                    <span className="text-sm text-muted-foreground shrink-0">{assetUnitText(target)}</span>
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                block
                onClick={() => setShowMovePicker(false)}
              >
                {t('common.cancel')}
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </Screen>
  );
}
