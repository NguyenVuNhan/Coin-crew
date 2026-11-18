import { useId, useMemo, useState, type FormEvent, type JSX } from 'react';
import {
  ASSET_GROUPS,
  assetUnitText,
  parseAssetUnit,
  type AssetView,
} from '@cc/core';
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
  const [unitText, setUnitText] = useState(asset ? assetUnitText(asset) : '');
  const [unitTouched, setUnitTouched] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>(
    asset ? (initialInChips ? asset.groupName : '') : (groupChips[0] ?? 'Crypto'),
  );
  const [isOtherGroup, setIsOtherGroup] = useState<boolean>(asset ? !initialInChips : false);
  const [customGroup, setCustomGroup] = useState<string>(
    asset && !initialInChips ? asset.groupName : '',
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const decimalsLocked = Boolean(asset && asset.entryCount > 0);
  const resolvedGroup = isOtherGroup ? customGroup.trim() : selectedGroup;
  const trimmedUnitText = unitText.trim();
  const parsedUnit = parseAssetUnit(unitText);
  const unitUnchanged = Boolean(asset && trimmedUnitText === assetUnitText(asset));
  const effectiveDecimals = unitUnchanged && asset ? asset.decimals : parsedUnit?.decimals;
  const decimalsChangedWhileLocked = Boolean(
    decimalsLocked && asset && parsedUnit && effectiveDecimals !== asset.decimals,
  );

  const unitErrorMessage =
    trimmedUnitText.length === 0
      ? unitTouched
        ? t('assets.unitRequired')
        : null
      : parsedUnit === null
        ? t('assets.unitStepError')
        : decimalsChangedWhileLocked
          ? t('assets.decimalsLocked')
          : null;

  const busy = createAsset.isPending || updateAsset.isPending;
  const mutationError = asset ? updateAsset.error : createAsset.error;
  const isDuplicateNameError = isDuplicateNameApiError(mutationError);
  const otherError = isDuplicateNameError ? null : mutationError;

  const canSubmit =
    name.trim().length > 0 &&
    parsedUnit !== null &&
    !decimalsChangedWhileLocked &&
    resolvedGroup.length > 0 &&
    !busy;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !parsedUnit) return;
    setNameError(null);
    const trimmedName = name.trim();

    try {
      if (asset) {
        const res = await updateAsset.mutateAsync({
          id: asset.id,
          input: {
            name: trimmedName,
            unit: parsedUnit.unit,
            groupName: resolvedGroup,
            ...(decimalsLocked ? {} : { decimals: parsedUnit.decimals }),
          },
        });
        onSaved(res.asset);
      } else {
        const res = await createAsset.mutateAsync({
          name: trimmedName,
          unit: parsedUnit.unit,
          groupName: resolvedGroup,
          decimals: parsedUnit.decimals,
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
          value={unitText}
          onChange={(e) => {
            setUnitTouched(true);
            setUnitText(e.target.value);
          }}
          data-testid="asset-unit-input"
          className="min-h-11 text-base"
        />
        <p className="m-0 text-xs text-muted-foreground">{t('assets.unitHelp')}</p>
        {unitErrorMessage && (
          <div
            data-testid={
              decimalsChangedWhileLocked ? 'asset-decimals-locked-reason' : 'asset-unit-error'
            }
          >
            <InlineError error={ownError(unitErrorMessage)} />
          </div>
        )}
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
