import { useEffect, useMemo, useRef, useState, type Dispatch, type JSX, type SetStateAction } from 'react';
import { formatMoney, type PersonView, type SplitMode, type SplitResult } from '@cc/core';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { Amount } from '@cc/web-ui/components/Amount';
import { AmountSuggestionChips } from '@cc/web-ui/components/AmountKeypad';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { BottomBar } from '@cc/web-ui/components/BottomBar';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError, errorText } from '@cc/web-ui/components/InlineError';
import { Pill } from '@cc/web-ui/components/Pill';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';
import { useIsMousePointer } from '@cc/web-util/media';
import type { RecentGroup } from '@cc/web-util/recentGroups';
import { AmountField } from './AmountField';
import { DockedAmountKeypad, useLiveAnnouncer } from './AmountKeypadDock';
import { EntryDateRow } from './EntryDateRow';
import { SmallAmountModal } from './SmallAmountModal';
import { SplitModePicker } from './SplitModePicker';
import { SplitPeopleSheet, type SplitPeopleSheetProps } from './SplitPeopleSheet';

const MODE_LABEL_KEY: Record<SplitMode, MessageKey> = {
  equal: 'split.mode.equal',
  amounts: 'split.mode.exact',
  percent: 'split.mode.percent',
  shares: 'split.mode.shares',
  adjust: 'split.mode.adjust',
};

export interface LoanDebtEmbedFormProps {
  amountExpr: string;
  evaluatedMinor: number | null;
  onAmountExprChange(next: string): void;
  keypadOpen: boolean;
  onKeypadOpenChange(open: boolean): void;
  onKeypadDone(minor: number): void;
  formPeople: readonly PersonView[];
  me: string | null;
  included: ReadonlySet<string>;
  onIncludedChange(next: Set<string>): void;
  peopleSheetOpen: boolean;
  onPeopleSheetOpenChange(open: boolean): void;
  recent: readonly RecentGroup[];
  splitExtra?: SplitPeopleSheetProps['extra'];
  payerId: string;
  onPayerChange(id: string): void;
  description: string;
  onDescriptionChange(val: string): void;
  spentOn: string;
  onSpentOnChange(val: string): void;
  mode: SplitMode;
  onModeChange(mode: SplitMode): void;
  caption: string;
  liveShares: ReadonlyMap<string, number>;
  displayShare(amt: number | undefined): string;
  placeholderFor(personId: string): string;
  inputErrors: Readonly<Record<string, boolean>>;
  amountsInputs: Record<string, string>;
  onAmountsInputsChange: Dispatch<SetStateAction<Record<string, string>>>;
  percentInputs: Record<string, string>;
  onPercentInputsChange: Dispatch<SetStateAction<Record<string, string>>>;
  sharesInputs: Record<string, string>;
  onSharesInputsChange: Dispatch<SetStateAction<Record<string, string>>>;
  adjustInputs: Record<string, string>;
  onAdjustInputsChange: Dispatch<SetStateAction<Record<string, string>>>;
  splitResult: SplitResult | null;
  canSubmit: boolean;
  isSubmitting: boolean;
  disabledReason: string | null;
  submitError: unknown;
  formatSubmitError(err: unknown): unknown;
  goneNames: readonly string[];
  onSave(): void;
  smallAmountMinor: number | null;
  onSmallAmountClose(): void;
  onSmallAmountKeep(minor: number): void;
  onSmallAmountMultiply(multiplied: number): void;
}

/** Embedded Vay/Nợ quick-expense form matching EntryPage's Chi/Thu layout and AmountKeypad flow. */
export function LoanDebtEmbedForm({
  amountExpr,
  evaluatedMinor,
  onAmountExprChange,
  keypadOpen,
  onKeypadOpenChange,
  onKeypadDone: _onKeypadDone,
  formPeople,
  me,
  included,
  onIncludedChange,
  peopleSheetOpen,
  onPeopleSheetOpenChange,
  recent,
  splitExtra,
  payerId,
  onPayerChange,
  description,
  onDescriptionChange,
  spentOn,
  onSpentOnChange,
  mode,
  onModeChange,
  caption,
  liveShares,
  displayShare,
  placeholderFor,
  inputErrors,
  amountsInputs,
  onAmountsInputsChange,
  percentInputs,
  onPercentInputsChange,
  sharesInputs,
  onSharesInputsChange,
  adjustInputs,
  onAdjustInputsChange,
  splitResult,
  canSubmit,
  isSubmitting,
  disabledReason,
  submitError,
  formatSubmitError,
  goneNames,
  onSave,
  smallAmountMinor,
  onSmallAmountClose,
  onSmallAmountKeep,
  onSmallAmountMultiply,
}: LoanDebtEmbedFormProps): JSX.Element {
  const t = useT();
  const isMousePointer = useIsMousePointer();
  const effectiveKeypadOpen = !isMousePointer && keypadOpen;
  const amountAreaRef = useRef<HTMLDivElement>(null);
  const amountButtonRef = useRef<HTMLButtonElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const whoBlockRef = useRef<HTMLDivElement>(null);
  const withRowRef = useRef<HTMLButtonElement>(null);
  const saveBarRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<'with' | 'save' | null>(null);
  const [keypadFocusToken, setKeypadFocusToken] = useState(0);
  const { announce, announceSoon, region: liveRegion } = useLiveAnnouncer();

  useEffect(() => {
    if (isMousePointer) {
      amountInputRef.current?.focus();
    }
  }, [isMousePointer]);
  const amountText =
    evaluatedMinor !== null ? formatMoney(evaluatedMinor, 'VND') : amountExpr || t('personalEntry.amountNotEntered');
  const amountLabel = t('personalEntry.amountLabel', { amount: amountText });
  const spokenAmountRef = useRef('');
  spokenAmountRef.current = amountLabel;

  useEffect(() => {
    if (smallAmountMinor !== null) {
      announce(
        `${t('personalEntry.smallAmountTitle')} ${t('personalEntry.smallAmountBody', {
          amount: formatMoney(smallAmountMinor, 'VND'),
        })}`,
      );
    }
  }, [smallAmountMinor]);

  useEffect(() => {
    if (submitError) announce(errorText(formatSubmitError(submitError), t));
  }, [submitError]);

  useEffect(() => {
    if (keypadOpen || pendingFocusRef.current === null) return;
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (target === 'with') {
      withRowRef.current?.focus();
      withRowRef.current?.scrollIntoView?.({ block: 'nearest' });
    } else {
      saveBarRef.current?.querySelector<HTMLButtonElement>('[data-testid="entry-save-btn"]')?.focus();
    }
  }, [keypadOpen]);
  const [payerSheetOpen, setPayerSheetOpen] = useState(false);
  const [splitExpanded, setSplitExpanded] = useState(false);

  const otherChosenPeople = useMemo(
    () => formPeople.filter((p) => included.has(p.id) && p.id !== me),
    [formPeople, included, me],
  );

  const sortedPayers = useMemo(() => {
    if (!me) return formPeople;
    const mePerson = formPeople.find((p) => p.id === me);
    if (!mePerson) return formPeople;
    return [mePerson, ...formPeople.filter((p) => p.id !== me)];
  }, [formPeople, me]);

  const selectedPayer = formPeople.find((p) => p.id === payerId);

  return (
    <>
      {liveRegion}
      <main
        className={cn(
          'flex-1 mx-auto w-full max-w-[480px] px-4 py-4 flex flex-col gap-4',
          !effectiveKeypadOpen && 'pb-24',
        )}
      >
        {/* 1. Amount first */}
        <div ref={amountAreaRef} className="flex flex-col gap-2">
          {isMousePointer ? (
            <AmountField
              label={t('personalEntry.amountBoxLabel')}
              value={amountExpr}
              currency="VND"
              tone="neutral"
              inputRef={amountInputRef}
              testId="amount-display"
              inputTestId="amount-input"
              disabled={isSubmitting}
              onChange={(next) => {
                announceSoon(() => spokenAmountRef.current);
                onAmountExprChange(next);
              }}
              onDone={() => {
                if (otherChosenPeople.length === 0) {
                  withRowRef.current?.focus();
                  withRowRef.current?.scrollIntoView?.({ block: 'nearest' });
                } else {
                  saveBarRef.current?.querySelector<HTMLButtonElement>('[data-testid="entry-save-btn"]')?.focus();
                }
              }}
            />
          ) : (
            <button
              type="button"
              data-testid="amount-display"
              ref={amountButtonRef}
              aria-label={amountLabel}
              aria-expanded={keypadOpen}
              onClick={() => {
                onKeypadOpenChange(true);
                setKeypadFocusToken((n) => n + 1);
              }}
              className={cn(
                'w-full rounded-xl bg-card px-4 py-3 flex items-center justify-between gap-3 min-h-16 cursor-pointer text-right border-0',
                keypadOpen && 'ring-2 ring-primary',
              )}
            >
              <span aria-hidden="true" className="text-sm font-medium text-muted-foreground shrink-0">
                {t('personalEntry.amountBoxLabel')}
              </span>
              <span className="flex flex-col items-end tabular-nums min-w-0">
                {evaluatedMinor !== null ? (
                  <Amount value={evaluatedMinor} currency="VND" size="xl" tone="neutral" />
                ) : (
                  <span className="text-2xl font-bold tabular-nums text-muted-foreground">
                    {amountExpr || formatMoney(0, 'VND')}
                  </span>
                )}
              </span>
            </button>
          )}

          {!isMousePointer &&
            !keypadOpen &&
            evaluatedMinor !== null &&
            evaluatedMinor >= 1 &&
            evaluatedMinor <= 999 && (
              <AmountSuggestionChips
                value={amountExpr}
                currency="VND"
                onSelect={onAmountExprChange}
              />
            )}
        </div>

        {/* 2. Who block */}
        <div ref={whoBlockRef} className="rounded-xl bg-card divide-y divide-border overflow-hidden">
          <button
            type="button"
            ref={withRowRef}
            data-testid="loan-debt-with-row"
            onClick={() => onPeopleSheetOpenChange(true)}
            className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 bg-transparent border-0 text-left cursor-pointer hover:bg-muted/50"
          >
            <span className="text-sm font-medium text-muted-foreground shrink-0">
              {t('loanDebt.withWho')}
            </span>
            <span className="flex items-center gap-2 min-w-0 justify-end">
              {otherChosenPeople.length > 0 ? (
                <>
                  <span className="flex shrink-0 -space-x-2" aria-hidden="true">
                    {otherChosenPeople.slice(0, 3).map((p) => (
                      <Avatar
                        key={p.id}
                        name={p.name}
                        avatarUrl={p.avatarUrl}
                        size="sm"
                        className="ring-2 ring-card"
                      />
                    ))}
                  </span>
                  <span className="text-base font-medium text-foreground truncate">
                    {otherChosenPeople.map((p) => p.name).join(', ')}
                  </span>
                </>
              ) : (
                <span className="text-base font-medium text-muted-foreground">
                  {t('loanDebt.choosePeople')}
                </span>
              )}
              <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
            </span>
          </button>

          <button
            type="button"
            data-testid="loan-debt-payer-row"
            onClick={() => setPayerSheetOpen(true)}
            className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 bg-transparent border-0 text-left cursor-pointer hover:bg-muted/50"
          >
            <span className="text-sm font-medium text-muted-foreground shrink-0">
              {t('expenseForm.paidBy')}
            </span>
            <span className="flex items-center gap-1 min-w-0 justify-end">
              <span className="text-base font-medium text-foreground truncate">
                {selectedPayer
                  ? selectedPayer.id === me
                    ? t('expenseForm.me', { name: selectedPayer.name })
                    : selectedPayer.name
                  : t('expenseForm.choosePayer')}
              </span>
              <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
            </span>
          </button>
        </div>

        {/* 3. Details block */}
        <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
          <div className="w-full min-h-11 px-4 py-2 flex items-center justify-between gap-3">
            <Label htmlFor="expense-what-for" className="text-sm font-medium text-muted-foreground shrink-0">
              {t('personalEntry.note')}
            </Label>
            <Input
              id="expense-what-for"
              type="text"
              maxLength={80}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={t('expenseForm.whatForPlaceholder')}
              className="text-base border-0 shadow-none text-right px-0 focus-visible:ring-0 min-h-11"
            />
          </div>

          <EntryDateRow
            date={spentOn}
            time={null}
            showTime={false}
            onChange={(next) => onSpentOnChange(next.date)}
          />
        </div>

        {/* 4. Split, collapsed by default behind "Chia khác" */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="loan-debt-split-toggle"
            aria-expanded={splitExpanded}
            onClick={() => setSplitExpanded((prev) => !prev)}
            className="min-h-11 px-1 flex items-center justify-between gap-2 text-sm font-medium bg-transparent border-0 cursor-pointer"
          >
            <span className="text-primary font-semibold">{t('loanDebt.splitDifferently')}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <span>
                {t('loanDebt.splitSummaryCount', {
                  mode: t(MODE_LABEL_KEY[mode]),
                  n: included.size,
                })}
              </span>
              <Icon name={splitExpanded ? 'chevronUp' : 'chevronDown'} size={18} />
            </span>
          </button>

          {splitExpanded && (
            <div className="flex flex-col gap-2">
              <SplitModePicker
                variant="words"
                value={mode}
                onChange={onModeChange}
              />

              <p className="fsl-split-caption m-0 px-1 text-sm leading-snug text-muted-foreground tabular-nums">
                {caption}
              </p>

              <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
                {formPeople.filter((person) => included.has(person.id)).map((person) => {
                  const shareAmount = liveShares.get(person.id);
                  const isInputInvalid = Boolean(inputErrors[person.id]);

                  const renderModeInput = (
                    labelKey: 'expenseForm.adjustFor' | 'expenseForm.amountFor' | 'expenseForm.percentFor' | 'expenseForm.sharesFor',
                    values: Record<string, string>,
                    setValues: Dispatch<SetStateAction<Record<string, string>>>,
                  ) => (
                    <div className="fsl-split-row__control flex flex-col items-end gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="fsl-input fsl-split-row__input w-24 px-2 text-right tabular-nums"
                        aria-label={t(labelKey, { name: person.name })}
                        value={values[person.id] ?? ''}
                        placeholder={placeholderFor(person.id)}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [person.id]: e.target.value,
                          }))
                        }
                      />
                      {isInputInvalid && (
                        <span role="alert" className="fsl-field-error text-xs text-danger">
                          {t('expenseForm.amountInvalid')}
                        </span>
                      )}
                    </div>
                  );

                  return (
                    <div
                      key={person.id}
                      className="fsl-split-row flex items-center gap-3 px-4 py-2 min-h-11"
                      data-testid={`split-row-${person.name}`}
                    >
                      <Avatar name={person.name} avatarUrl={person.avatarUrl} size="sm" />
                      <span className="fsl-split-row__name flex-1 min-w-0 font-semibold text-base text-foreground truncate">
                        {person.id === me
                          ? t('expenseForm.me', { name: person.name })
                          : person.name}
                      </span>
                      {person.status === 'left' && <Pill tone="neutral">{t('people.leftBadge')}</Pill>}

                      {mode === 'adjust' && renderModeInput('expenseForm.adjustFor', adjustInputs, onAdjustInputsChange)}
                      {mode === 'amounts' && renderModeInput('expenseForm.amountFor', amountsInputs, onAmountsInputsChange)}
                      {mode === 'percent' && renderModeInput('expenseForm.percentFor', percentInputs, onPercentInputsChange)}
                      {mode === 'shares' && renderModeInput('expenseForm.sharesFor', sharesInputs, onSharesInputsChange)}

                      {shareAmount !== undefined && (
                        <span className="fsl-split-row__share font-semibold tabular-nums text-right whitespace-nowrap text-base text-foreground min-w-16">
                          {displayShare(shareAmount)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {evaluatedMinor !== null && splitResult && !splitResult.ok && (
                <div role="alert" className="fsl-split-error px-1 text-sm font-medium leading-snug text-danger">
                  {t(`splitError.${splitResult.error}` as MessageKey)}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 5. Docked keypad or BottomBar Save */}
      {effectiveKeypadOpen ? (
        <DockedAmountKeypad
          open={keypadOpen}
          onClose={() => onKeypadOpenChange(false)}
          amountAreaRef={amountAreaRef}
          value={amountExpr}
          currency="VND"
          onChange={(next) => {
            announceSoon(() => spokenAmountRef.current);
            onAmountExprChange(next);
          }}
          onEscape={() => {
            amountButtonRef.current?.focus();
            onKeypadOpenChange(false);
          }}
          focusToken={keypadFocusToken}
          tabOutRef={whoBlockRef}
          onDone={(minor) => {
            const formatted = String(Math.trunc(minor));
            if (formatted !== amountExpr) {
              announceSoon(() => spokenAmountRef.current);
              onAmountExprChange(formatted);
            }
            pendingFocusRef.current = otherChosenPeople.length === 0 ? 'with' : 'save';
            onKeypadOpenChange(false);
          }}
          doneLabel={t('personalEntry.done')}
          deleteLabel={t('personalEntry.deleteDigit')}
          disabled={isSubmitting}
        />
      ) : (
        <div ref={saveBarRef}>
          <BottomBar>
            {submitError ? <InlineError error={formatSubmitError(submitError)} /> : null}
            {goneNames.length > 0 && (
              <p className="fsl-expense-form__gone m-0 mb-2 text-center text-sm leading-snug text-muted-foreground" role="status">
                {t('expenseForm.peopleLeft', { names: goneNames.join(', ') })}
              </p>
            )}
            {!canSubmit && disabledReason && (
              <p data-testid="loan-debt-disabled-reason" className="m-0 mb-2 text-center text-sm text-muted-foreground">
                {disabledReason}
              </p>
            )}
            <Button
              type="button"
              variant="primary"
              block
              loading={isSubmitting}
              disabled={!canSubmit || isSubmitting}
              data-testid="entry-save-btn"
              onClick={onSave}
            >
              {t('personalEntry.save')}
            </Button>
          </BottomBar>
        </div>
      )}

      {/* People picker Sheet */}
      <SplitPeopleSheet
        open={peopleSheetOpen}
        onClose={() => onPeopleSheetOpenChange(false)}
        people={formPeople}
        chosen={included}
        onChange={onIncludedChange}
        me={me}
        recent={recent}
        extra={splitExtra}
      />

      {/* Payer picker Sheet (you first) */}
      <Sheet
        open={payerSheetOpen}
        onClose={() => setPayerSheetOpen(false)}
        title={t('expenseForm.paidBy')}
      >
        <div data-testid="payer-picker-list" className="flex flex-col divide-y divide-border">
          {sortedPayers.map((person) => {
            const isSelected = person.id === payerId;
            return (
              <button
                key={person.id}
                type="button"
                data-testid={`payer-option-${person.id}`}
                onClick={() => {
                  onPayerChange(person.id);
                  setPayerSheetOpen(false);
                }}
                className="min-h-11 px-2 py-3 flex items-center justify-between gap-3 bg-transparent border-0 text-left cursor-pointer hover:bg-muted rounded-xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={person.name} avatarUrl={person.avatarUrl} size="sm" />
                  <span className="text-base font-medium text-foreground truncate">
                    {person.id === me
                      ? t('expenseForm.me', { name: person.name })
                      : person.name}
                  </span>
                </div>
                {isSelected && <Icon name="check" size={18} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* Small-amount guard Modal */}
      <SmallAmountModal
        minor={smallAmountMinor}
        onClose={onSmallAmountClose}
        onKeep={onSmallAmountKeep}
        onMultiply={onSmallAmountMultiply}
        disabled={isSubmitting}
      />
    </>
  );
}
