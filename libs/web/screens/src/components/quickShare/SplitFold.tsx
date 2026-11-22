import { useMemo, useState, type JSX } from 'react';
import { formatMoney, type PersonView, type SplitMode } from '@cc/core';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Icon } from '@cc/web-ui/components/icons';
import { Pill } from '@cc/web-ui/components/Pill';
import { Input } from '@cc/web-ui/components/ui/input';
import { fromEntryValue, readSplitInput } from '@cc/web-util/splitInput';
import { SplitModePicker } from '../SplitModePicker';
import type { QuickSplit } from './useQuickSplit';

const MODE_LABEL_KEY: Record<SplitMode, MessageKey> = {
  equal: 'split.mode.equal',
  amounts: 'split.mode.exact',
  percent: 'split.mode.percent',
  shares: 'split.mode.shares',
  adjust: 'split.mode.adjust',
};

type NonEqualMode = Exclude<SplitMode, 'equal'>;

const MODE_INPUT_LABEL_KEY: Record<NonEqualMode, MessageKey> = {
  amounts: 'expenseForm.amountFor',
  percent: 'expenseForm.percentFor',
  shares: 'expenseForm.sharesFor',
  adjust: 'expenseForm.adjustFor',
};

export interface SplitFoldProps {
  split: QuickSplit;
  amount: number | null;
  names: ReadonlyMap<string, string>;
}

/**
 * Collapsible split-mode row for the entry page. Hidden when fewer than two people are in the split.
 */
export function SplitFold({ split, amount, names }: SplitFoldProps): JSX.Element | null {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const peopleById = useMemo(() => {
    const map = new Map<string, PersonView>();
    for (const person of split.people) {
      map.set(person.id, person);
    }
    return map;
  }, [split.people]);

  const liveShares = useMemo(() => {
    const map = new Map<string, number>();
    if (split.result?.ok) {
      for (const share of split.result.shares) {
        map.set(share.participantId, share.amount);
      }
      return map;
    }
    if (split.mode === 'amounts') {
      for (const id of split.splitParticipants) {
        const parsed = readSplitInput('amounts', split.inputs[id] ?? '');
        if (parsed.ok && parsed.value !== null) {
          map.set(id, parsed.value);
        }
      }
    } else if (split.mode === 'percent' && amount !== null) {
      for (const id of split.splitParticipants) {
        const parsed = readSplitInput('percent', split.inputs[id] ?? '');
        if (parsed.ok && parsed.value !== null) {
          map.set(id, Math.round((amount * parsed.value) / 10000));
        }
      }
    }
    return map;
  }, [split.result, split.mode, split.splitParticipants, split.inputs, amount]);

  const percentStats = useMemo(() => {
    let assigned = 0;
    let autoCount = 0;
    if (split.mode !== 'percent') return { assigned, autoCount };
    for (const id of split.splitParticipants) {
      const parsed = readSplitInput('percent', split.inputs[id] ?? '');
      if (parsed.ok && parsed.value !== null) {
        assigned += parsed.value;
      } else if (parsed.ok && parsed.value === null) {
        autoCount += 1;
      }
    }
    return { assigned, autoCount };
  }, [split.mode, split.splitParticipants, split.inputs]);

  if (split.splitParticipants.length < 2) {
    return null;
  }

  function placeholderFor(personId: string): string {
    switch (split.mode) {
      case 'amounts': {
        const share = split.result?.ok
          ? split.result.shares.find((s) => s.participantId === personId)?.amount
          : undefined;
        return share === undefined ? '0' : fromEntryValue('amounts', share);
      }
      case 'percent': {
        const { assigned, autoCount } = percentStats;
        return autoCount > 0 && assigned < 10000
          ? fromEntryValue('percent', Math.round((10000 - assigned) / autoCount))
          : '0';
      }
      case 'shares':
        return '1';
      default:
        return '0';
    }
  }

  const errorMessage =
    split.result && !split.result.ok
      ? split.result.error === 'INVALID_VALUE'
        ? t('loanDebt.splitMismatch')
        : t(`splitError.${split.result.error}` as MessageKey)
      : null;

  return (
    <div className="fsl-split-fold flex flex-col gap-2">
      <button
        type="button"
        data-testid="entry-split-fold"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="min-h-11 w-full px-1 flex items-center justify-between gap-2 text-sm font-medium bg-transparent border-0 cursor-pointer"
      >
        <span className="text-primary font-semibold">{t('expenseForm.split')}</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span>
            {t('loanDebt.splitSummaryCount', {
              mode: t(MODE_LABEL_KEY[split.mode]),
              n: split.splitParticipants.length,
            })}
          </span>
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={18} />
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2">
          <SplitModePicker
            variant="words"
            value={split.mode}
            onChange={(mode) => split.setMode(mode)}
          />

          <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
            {split.splitParticipants.map((personId) => {
              const person = peopleById.get(personId);
              const displayName = names.get(personId) ?? person?.name ?? personId;
              const rawValue = split.inputs[personId] ?? '';
              const isInputInvalid =
                split.mode !== 'equal' &&
                rawValue.trim() !== '' &&
                !readSplitInput(split.mode, rawValue).ok;
              const shareAmount = liveShares.get(personId);

              return (
                <div
                  key={personId}
                  className="fsl-split-row flex items-center gap-3 px-4 py-2 min-h-11"
                  data-testid={`entry-split-row-${personId}`}
                >
                  <Avatar name={displayName} avatarUrl={person?.avatarUrl ?? null} size="sm" />
                  <span className="fsl-split-row__name flex-1 min-w-0 font-semibold text-base text-foreground truncate">
                    {displayName}
                  </span>
                  {person?.status === 'left' && <Pill tone="neutral">{t('people.leftBadge')}</Pill>}

                  {split.mode !== 'equal' && (
                    <div className="fsl-split-row__control flex flex-col items-end gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        data-testid={`entry-split-input-${personId}`}
                        className="fsl-input fsl-split-row__input w-24 px-2 text-right tabular-nums text-base"
                        aria-label={t(MODE_INPUT_LABEL_KEY[split.mode], { name: displayName })}
                        value={rawValue}
                        placeholder={placeholderFor(personId)}
                        onChange={(e) => split.setInput(personId, e.target.value)}
                      />
                      {isInputInvalid && (
                        <span role="alert" className="fsl-field-error text-xs text-danger">
                          {t('expenseForm.amountInvalid')}
                        </span>
                      )}
                    </div>
                  )}

                  {shareAmount !== undefined && (
                    <span className="fsl-split-row__share font-semibold tabular-nums text-right whitespace-nowrap text-base text-foreground min-w-16">
                      {formatMoney(shareAmount, 'VND')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {errorMessage && (
            <div role="alert" className="fsl-split-error px-1 text-sm font-medium leading-snug text-danger">
              {errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
