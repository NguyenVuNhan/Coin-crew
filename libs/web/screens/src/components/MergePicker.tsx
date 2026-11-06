import { useEffect, useState, type JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MergeCandidate, MergeStep, PersonKey } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useMergeOptions, mergePeople } from '@cc/web-data-access/people';
import { searchPeople } from '@cc/web-util/searchPeople';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Pill } from '@cc/web-ui/components/Pill';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Input } from '@cc/web-ui/components/ui/input';

export interface MergePickerProps {
  person: { key: PersonKey; name: string };
  open: boolean;
  onClose: () => void;
  onMerged: (r: { key: PersonKey; proposals: string[] }) => void;
}

function getTagInfo(
  c: MergeCandidate,
  t: (key: any, vars?: Record<string, string | number>) => string,
): { tone: 'neutral' | 'accent' | 'warning'; text: string } {
  if (c.plan.ok) {
    const nonLinkStep = c.plan.steps.find((s) => s.kind !== 'link');
    const group =
      nonLinkStep && 'tripName' in nonLinkStep ? nonLinkStep.tripName : '';

    switch (c.plan.tag) {
      case 'link':
        return { tone: 'neutral', text: t('merge.tagOnlyYou') };
      case 'merge':
        return { tone: 'accent', text: t('merge.tagGroup', { group }) };
      case 'ask_admin':
        return { tone: 'warning', text: t('merge.tagAskAdmin', { group }) };
      case 'ask_user': {
        const hasNeedsAdmin = c.plan.steps.some(
          (s) => s.kind === 'ask_user' && s.needsAdmin,
        );
        if (hasNeedsAdmin) {
          return {
            tone: 'warning',
            text: t('merge.tagAskUser', { name: c.name, group }),
          };
        }
        return {
          tone: 'warning',
          text: t('merge.tagAskUserOnly', { name: c.name }),
        };
      }
    }
  }

  const block = c.plan.block;
  if (block.reason === 'both_signed_in') {
    return { tone: 'neutral', text: t('person.mergeBothSignedIn') };
  }
  if (block.reason === 'claim_pending' && block.byTarget) {
    return {
      tone: 'neutral',
      text: t('merge.tagClaimPending', {
        name: c.name,
        group: block.tripName,
      }),
    };
  }
  const group = 'tripName' in block ? block.tripName : '';
  return { tone: 'neutral', text: t('merge.tagBusy', { group }) };
}

function renderStep(
  step: MergeStep,
  idx: number,
  aName: string,
  bName: string,
  t: (key: any, vars?: Record<string, string | number>) => string,
): JSX.Element {
  let text = '';
  switch (step.kind) {
    case 'link':
      text = t('merge.stepLink');
      break;
    case 'merge':
      text = t('merge.stepMerge', {
        b: bName,
        a: aName,
        group: step.tripName,
      });
      break;
    case 'ask_admin':
      text = t('merge.stepAskAdmin', { group: step.tripName });
      break;
    case 'ask_user':
      if (step.needsAdmin) {
        text = t('merge.stepAskUser', {
          name: bName,
          group: step.tripName,
        });
      } else {
        text = t('merge.stepAskUserOnly', { name: bName });
      }
      break;
  }
  return (
    <p key={idx} className="text-sm text-foreground m-0">
      {text}
    </p>
  );
}

export function MergePicker({
  person,
  open,
  onClose,
  onMerged,
}: MergePickerProps): JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MergeCandidate | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mergeOptions = useMergeOptions(person.key, open);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPicked(null);
      setError(null);
      setSending(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!picked) return;
    setSending(true);
    setError(null);
    try {
      const result = await mergePeople([person.key, picked.key], queryClient);
      onMerged(result);
      setPicked(null);
      setQuery('');
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  };

  const candidates = mergeOptions.data?.candidates ?? [];
  const filtered = searchPeople(candidates, query);
  const isQueryEmpty = query.trim() === '';

  const renderRow = (c: MergeCandidate) => {
    const { tone: tagTone, text: tagText } = getTagInfo(c, t);
    const groupPart = c.groups
      .map((g) => (g.kind === 'direct' ? t('person.quickExpenses') : g.tripName))
      .join(', ');
    const meta = [c.signIn?.label, groupPart]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join(' · ');

    return (
      <button
        key={c.key}
        type="button"
        data-testid={`merge-pick-${c.key}`}
        className="flex w-full items-center gap-3 min-h-11 px-4 py-2 text-left disabled:opacity-60"
        disabled={!c.plan.ok}
        onClick={() => setPicked(c)}
      >
        <Avatar name={c.name} avatarUrl={c.avatarUrl} />
        <div className="min-w-0 flex-1 flex flex-col items-start">
          <div className="w-full text-base font-medium truncate text-foreground">
            {c.name}
          </div>
          {meta !== '' && (
            <div className="w-full text-sm text-muted-foreground truncate">
              {meta}
            </div>
          )}
          <Pill tone={tagTone} className="mt-1">
            {tagText}
          </Pill>
        </div>
      </button>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('merge.pickTitle', { name: person.name })}
    >
      {picked ? (
        <div className="flex flex-col gap-3 py-2">
          <h3 className="text-base font-semibold m-0">
            {t('merge.pickConfirmTitle', { a: person.name, b: picked.name })}
          </h3>
          {picked.plan.ok &&
            picked.plan.steps.map((step, idx) =>
              renderStep(step, idx, person.name, picked.name, t),
            )}
          {error !== null && <InlineError error={error} />}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="primary"
              block
              data-testid="merge-confirm"
              loading={sending}
              disabled={sending}
              onClick={handleConfirm}
            >
              {t('merge.pickConfirm')}
            </Button>
            <Button
              variant="ghost"
              block
              disabled={sending}
              onClick={() => {
                setPicked(null);
                setError(null);
              }}
            >
              {t('merge.back')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 py-2">
          <Input
            type="search"
            className="h-11 text-base"
            data-testid="merge-search"
            aria-label={t('merge.searchPlaceholder')}
            placeholder={t('merge.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {mergeOptions.isLoading ? (
            <SkeletonList rows={3} />
          ) : mergeOptions.error ? (
            <InlineError
              error={mergeOptions.error}
              onRetry={() => void mergeOptions.refetch()}
            />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground m-0 py-4 text-center">
              {t('merge.noResults')}
            </p>
          ) : isQueryEmpty ? (
            <div className="flex flex-col gap-3">
              {(() => {
                const suggested = filtered.filter((c) => c.similar === true);
                const everyone = filtered.filter((c) => !c.similar);
                return (
                  <>
                    {suggested.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground px-1 pt-3 pb-1">
                          {t('merge.suggested', { name: person.name })}
                        </div>
                        <div className="overflow-hidden rounded-xl bg-card divide-y divide-border">
                          {suggested.map(renderRow)}
                        </div>
                      </div>
                    )}
                    {everyone.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground px-1 pt-3 pb-1">
                          {t('merge.everyone')}
                        </div>
                        <div className="overflow-hidden rounded-xl bg-card divide-y divide-border">
                          {everyone.map(renderRow)}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-card divide-y divide-border">
              {filtered.map(renderRow)}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
