import type { JSX } from 'react';
import { formatMoney } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import type { QuickSplit, QuickSplitKind } from './useQuickSplit';

export interface OutcomeSentenceProps {
  split: QuickSplit;
  kind: QuickSplitKind;
  names: ReadonlyMap<string, string>;
  onFlip(): void;
}

/**
 * Live-announced summary of who owes whom for the active quick split, with an optional ⇄ payer flip button.
 */
export function OutcomeSentence({
  split,
  kind,
  names,
  onFlip,
}: OutcomeSentenceProps): JSX.Element | null {
  const t = useT();

  if (split.chosen.size === 0 || !split.outcome) return null;

  const nameOf = (id: string) => names.get(id) ?? id;
  const parts: string[] = [];

  if (split.flipped) {
    parts.push(t('outcome.paidBy', { name: nameOf(split.payerId) }));
  } else if (kind === 'shared' && split.outcome.myShare > 0) {
    parts.push(t('outcome.myShare', { amount: formatMoney(split.outcome.myShare, 'VND') }));
  }

  const { lines } = split.outcome;
  const allEqualOwesMe =
    lines.length >= 2 &&
    lines.every((line) => line.direction === 'owesMe' && line.amount === lines[0]!.amount);

  if (allEqualOwesMe) {
    parts.push(
      t('outcome.eachOwesMe', {
        names: lines.map((line) => nameOf(line.personId)).join(', '),
        amount: formatMoney(lines[0]!.amount, 'VND'),
      }),
    );
  } else {
    for (const line of lines) {
      if (line.direction === 'owesMe') {
        parts.push(
          t('outcome.owesMe', {
            name: nameOf(line.personId),
            amount: formatMoney(line.amount, 'VND'),
          }),
        );
      } else {
        parts.push(
          t('outcome.iOwe', {
            name: nameOf(line.personId),
            amount: formatMoney(line.amount, 'VND'),
          }),
        );
      }
    }
  }

  if (parts.length === 0) return null;

  const sentence = parts.join(' · ');
  const hasIOwe = lines.some((line) => line.direction === 'iOwe');

  return (
    <div
      data-testid="entry-outcome"
      aria-live="polite"
      className={cn(
        'fsl-outcome',
        'flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 min-h-11',
        'bg-success-soft text-success',
      )}
    >
      <span className="fsl-outcome__text text-sm font-semibold tabular-nums leading-5">
        {sentence}
      </span>
      {split.canFlip && (
        <button
          type="button"
          data-testid="entry-flip"
          aria-label={t('entry.flip')}
          aria-pressed={split.flipped}
          onClick={onFlip}
          className={cn(
            'fsl-outcome__flip',
            'inline-flex items-center justify-center shrink-0 min-h-11 min-w-11 -my-1.5 -mr-2 rounded-full bg-transparent border-0 cursor-pointer transition-colors hover:bg-card/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'text-success',
          )}
        >
          <Icon name="swap" size={18} />
        </button>
      )}
    </div>
  );
}
