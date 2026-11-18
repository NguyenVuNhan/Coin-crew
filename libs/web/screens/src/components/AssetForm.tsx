import { useId, useMemo, useState, type FormEvent, type JSX } from 'react';
import { ASSET_GROUPS, MAX_ASSET_DECIMALS, type AssetView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { ApiClientError } from '@cc/web-data-access/client';
import { useCreateAsset, useUpdateAsset } from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError, ownError } from '@cc/web-ui/components/InlineError';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';

export interface AssetFormProps {
  asset?: AssetView;
  groups: string[];
  onSaved(asset: AssetView): void;
  onCancel(): void;
}

function isDuplicateNameApiError(err: unknown): boolean {
  if (!(err instanceof ApiClientError) || err.status !== 422) return false;
  if (err.details.field === 'name') return true;
  const nested = err.details.details;
  return Boolean(
    nested && typeof nested === 'object' && (nested as { field?: unknown }).field === 'name',
  );
}

export function AssetForm({ asset, groups, onSaved, onCancel }: AssetFormProps): JSX.Element {
  const t = useT();
  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();

  const nameId = useId();
  const unitId = useId();
  const customGroupId = useId();

  const groupChips = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const g of [...ASSET_GROUPS, ...groups]) {
      const trimmed = g.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        list.push(trimmed);
      }
    }
    return list;
  }, [groups]);

  const initialInChips = asset ? groupChips.includes(asset.groupName) : true;

  const [name, setName] = useState(asset?.name ?? '');
  const [unit, setUnit] = useState(asset?.unit ?? '');
  const [selectedGroup, setSelectedGroup] = useState<string>(
    asset ? (initialInChips ? asset.groupName : '') : (groupChips[0] ?? 'Crypto'),
  );
  const [isOtherGroup, setIsOtherGroup] = useState<boolean>(asset ? !initialInChips : false);
  const [customGroup, setCustomGroup] = useState<string>(
    asset && !initialInChips ? asset.groupName : '',
  );
  const [decimals, setDecimals] = useState<number>(asset?.decimals ?? 0);
  const [nameError, setNameError] = useState<string | null>(null);

  const decimalsLocked = Boolean(asset && asset.entryCount > 0);
  const resolvedGroup = isOtherGroup ? customGroup.trim() : selectedGroup;

  const busy = createAsset.isPending || updateAsset.isPending;
  const mutationError = asset ? updateAsset.error : createAsset.error;
  const isDuplicateNameError = isDuplicateNameApiError(mutationError);
  const otherError = isDuplicateNameError ? null : mutationError;

  const canSubmit =
    name.trim().length > 0 &&
    unit.trim().length > 0 &&
    resolvedGroup.length > 0 &&
    !busy;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setNameError(null);
    const trimmedName = name.trim();
    const trimmedUnit = unit.trim();

    try {
      if (asset) {
        const res = await updateAsset.mutateAsync({
          id: asset.id,
          input: {
            name: trimmedName,
            unit: trimmedUnit,
            groupName: resolvedGroup,
            ...(decimalsLocked ? {} : { decimals }),
          },
        });
        onSaved(res.asset);
      } else {
        const res = await createAsset.mutateAsync({
          name: trimmedName,
          unit: trimmedUnit,
          groupName: resolvedGroup,
          decimals,
        });
        onSaved(res.asset);
      }
    } catch (err) {
      if (isDuplicateNameApiError(err)) {
        setNameError(t('assets.duplicateName'));
      }
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="fsl-asset-form flex flex-col gap-4"
      data-testid="asset-form"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>{t('assets.name')}</Label>
        <Input
          id={nameId}
          type="text"
          required
          maxLength={40}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
            if (isDuplicateNameError) {
              (asset ? updateAsset : createAsset).reset();
            }
          }}
          data-testid="asset-name-input"
          className="min-h-11 text-base"
        />
        {nameError && <InlineError error={ownError(nameError)} />}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={unitId}>{t('assets.unit')}</Label>
        <Input
          id={unitId}
          type="text"
          required
          maxLength={20}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          data-testid="asset-unit-input"
          className="min-h-11 text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t('assets.group')}</span>
        <div className="flex flex-wrap gap-2" data-testid="asset-group-chips">
          {groupChips.map((group) => {
            const active = !isOtherGroup && selectedGroup === group;
            return (
              <button
                key={group}
                type="button"
                aria-pressed={active}
                data-testid={`asset-group-chip-${group}`}
                onClick={() => {
                  setIsOtherGroup(false);
                  setSelectedGroup(group);
                }}
                className={cn(
                  'min-h-11 px-3.5 rounded-full border text-sm font-medium transition-colors cursor-pointer',
                  active
                    ? 'border-primary bg-secondary text-secondary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {group}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={isOtherGroup}
            data-testid="asset-group-chip-other"
            onClick={() => setIsOtherGroup(true)}
            className={cn(
              'min-h-11 px-3.5 rounded-full border text-sm font-medium transition-colors cursor-pointer',
              isOtherGroup
                ? 'border-primary bg-secondary text-secondary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            {t('assets.otherGroup')}
          </button>
        </div>

        {isOtherGroup && (
          <Input
            id={customGroupId}
            type="text"
            required
            maxLength={40}
            value={customGroup}
            onChange={(e) => setCustomGroup(e.target.value)}
            placeholder={t('assets.otherGroupPlaceholder')}
            data-testid="asset-group-custom-input"
            className="min-h-11 text-base"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('assets.decimals')}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={t('assets.decimalsDecrease')}
            data-testid="asset-decimals-minus"
            disabled={decimalsLocked || decimals <= 0}
            onClick={() => setDecimals((d) => Math.max(0, d - 1))}
            className="min-h-11 min-w-11 rounded-full border border-border bg-card text-foreground text-lg font-semibold inline-flex items-center justify-center cursor-pointer hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            −
          </button>
          <span
            data-testid="asset-decimals-value"
            className="min-w-8 text-center text-base font-semibold tabular-nums text-foreground"
          >
            {decimals}
          </span>
          <button
            type="button"
            aria-label={t('assets.decimalsIncrease')}
            data-testid="asset-decimals-plus"
            disabled={decimalsLocked || decimals >= MAX_ASSET_DECIMALS}
            onClick={() => setDecimals((d) => Math.min(MAX_ASSET_DECIMALS, d + 1))}
            className="min-h-11 min-w-11 rounded-full border border-border bg-card text-foreground text-lg font-semibold inline-flex items-center justify-center cursor-pointer hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
        {decimalsLocked && (
          <p
            data-testid="asset-decimals-locked-reason"
            className="m-0 text-sm text-muted-foreground"
          >
            {t('assets.decimalsLocked')}
          </p>
        )}
      </div>

      {otherError && <InlineError error={otherError} />}

      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          loading={busy}
          data-testid="asset-save-btn"
        >
          {t('assets.save')}
        </Button>
      </div>
    </form>
  );
}
