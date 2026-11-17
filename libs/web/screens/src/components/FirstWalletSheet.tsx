import { useState, useId, useRef, useEffect, type JSX, type FormEvent } from 'react';
import {
  CURRENCY_CODES,
  formatMoney,
  formatVnd,
  parseMoney,
  parseVnd,
  type CurrencyCode,
  type WalletKind,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useCreateWallet } from '@cc/web-data-access/personal';
import { useAddWallet } from '@cc/web-data-access/personalMoney';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { cn } from '@cc/web-ui/lib/utils';

const ZERO_TEXT_RE = /^(?:0+(?:[.,]0{1,2})?)?$/;

export function FirstWalletSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const create = useCreateWallet();
  const addWallet = useAddWallet();

  const nameId = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const amountHintId = useId();
  const costVndId = useId();

  const [name, setName] = useState(() => t('book.walletNameDefault'));
  const [kind, setKind] = useState<WalletKind>('everyday');
  const [currency, setCurrency] = useState<CurrencyCode>('VND');
  const [amountText, setAmountText] = useState('');
  const [costVndText, setCostVndText] = useState('');

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setName(t('book.walletNameDefault'));
      setKind('everyday');
      setCurrency('VND');
      setAmountText('');
      setCostVndText('');
      create.reset();
      addWallet.reset();
    }
    prevOpenRef.current = open;
  }, [open, t, create, addWallet]);

  const trimmedAmount = amountText.trim();
  const hasMinus = trimmedAmount.startsWith('-') || trimmedAmount.startsWith('−');
  const unsignedAmount = hasMinus ? trimmedAmount.slice(1).trim() : trimmedAmount;
  const isZeroAmount = !hasMinus && ZERO_TEXT_RE.test(unsignedAmount);
  let resolvedAmount: number | null = null;
  let isAmountValid = false;

  if (isZeroAmount) {
    resolvedAmount = 0;
    isAmountValid = true;
  } else if (hasMinus && ZERO_TEXT_RE.test(unsignedAmount) && unsignedAmount !== '') {
    resolvedAmount = 0;
    isAmountValid = true;
  } else if (!(hasMinus && unsignedAmount === '')) {
    const parsed = parseMoney(unsignedAmount, currency);
    if (parsed !== null) {
      resolvedAmount = hasMinus ? -parsed : parsed;
      isAmountValid = true;
    }
  }

  const showCostVnd = currency !== 'VND' && resolvedAmount !== null && resolvedAmount !== 0;
  const trimmedCostVnd = costVndText.trim();
  let resolvedCostVnd: number | null = null;
  let isCostVndValid = true;

  if (showCostVnd && trimmedCostVnd !== '') {
    const parsedCost = parseVnd(trimmedCostVnd);
    if (parsedCost !== null) {
      resolvedCostVnd = parsedCost;
    } else {
      isCostVndValid = false;
    }
  }

  const isAmountInvalid = !isAmountValid;
  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length >= 1 &&
    trimmedName.length <= 40 &&
    isAmountValid &&
    resolvedAmount !== null &&
    isCostVndValid &&
    (!showCostVnd || resolvedCostVnd !== null);

  const isPending = create.isPending || addWallet.isPending;
  const activeError = addWallet.error ?? create.error;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isPending || resolvedAmount === null) return;

    if (currency !== 'VND' || kind !== 'everyday' || resolvedAmount < 0) {
      addWallet.mutate(
        {
          name: trimmedName,
          startAmount: resolvedAmount,
          currency,
          kind,
          ...(showCostVnd && resolvedCostVnd !== null ? { startCostVnd: resolvedCostVnd } : {}),
        },
        { onSuccess: onClose },
      );
      return;
    }

    create.mutate(
      { name: trimmedName, startAmount: resolvedAmount },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('book.walletSheetTitle')}>
      <form
        className="fsl-first-wallet flex flex-col gap-4"
        data-testid="first-wallet-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <p className="m-0 text-sm text-muted-foreground">
          {t('book.walletSheetBody')}
        </p>

        <div className="fsl-field flex flex-col gap-1.5">
          <Label htmlFor={nameId}>{t('book.walletName')}</Label>
          <Input
            id={nameId}
            data-testid="first-wallet-name"
            maxLength={40}
            autoComplete="off"
            className="fsl-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="fsl-field flex flex-col gap-1.5">
          <Label>{t('walletForm.kind')}</Label>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('walletForm.kind')}>
            {(['everyday', 'investment'] as const).map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`first-wallet-kind-${k}`}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors cursor-pointer',
                  kind === k
                    ? 'border-primary bg-secondary text-secondary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {k === 'everyday' ? t('wallets.everyday') : t('wallets.investment')}
              </button>
            ))}
          </div>
        </div>

        <div className="fsl-field flex flex-col gap-1.5">
          <Label>{t('walletForm.currency')}</Label>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('walletForm.currency')}>
            {CURRENCY_CODES.map((c) => (
              <button
                key={c}
                type="button"
                data-testid={`first-wallet-currency-${c}`}
                aria-pressed={currency === c}
                onClick={() => setCurrency(c)}
                className={cn(
                  'min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors cursor-pointer',
                  currency === c
                    ? 'border-primary bg-secondary text-secondary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="fsl-field flex flex-col gap-1.5">
          <Label htmlFor={amountId}>{t('book.walletAmount')}</Label>
          <Input
            id={amountId}
            data-testid="first-wallet-amount"
            type="text"
            inputMode="text"
            className="fsl-input fsl-input--amount font-semibold tabular-nums"
            aria-describedby={isAmountInvalid ? amountErrorId : amountHintId}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
          {trimmedAmount !== '' && isAmountValid && resolvedAmount !== null && (
            <div className="fsl-amount-preview text-sm font-semibold tabular-nums text-muted-foreground">
              {formatMoney(resolvedAmount, currency)}
            </div>
          )}
          {isAmountInvalid ? (
            <div
              id={amountErrorId}
              role="alert"
              className="fsl-field-error text-sm text-danger"
            >
              {t('expenseForm.amountInvalid')}
            </div>
          ) : (
            <div
              id={amountHintId}
              className="fsl-field-hint text-sm text-muted-foreground"
            >
              {t('book.walletAmountHint')}
            </div>
          )}
        </div>

        {showCostVnd && (
          <div className="fsl-field flex flex-col gap-1.5">
            <Label htmlFor={costVndId}>{t('walletForm.startCostVnd')}</Label>
            <Input
              id={costVndId}
              data-testid="first-wallet-cost-vnd"
              type="text"
              inputMode="decimal"
              className="fsl-input fsl-input--amount font-semibold tabular-nums"
              value={costVndText}
              onChange={(e) => setCostVndText(e.target.value)}
            />
            {trimmedCostVnd !== '' && isCostVndValid && resolvedCostVnd !== null && (
              <div className="text-sm font-semibold tabular-nums text-muted-foreground">
                {formatVnd(resolvedCostVnd)}
              </div>
            )}
            {!isCostVndValid ? (
              <div role="alert" className="fsl-field-error text-sm text-danger">
                {t('expenseForm.amountInvalid')}
              </div>
            ) : (
              <div className="fsl-field-hint text-sm text-muted-foreground">
                {t('walletForm.startCostVndHint')}
              </div>
            )}
          </div>
        )}

        {activeError && <InlineError error={activeError} />}

        <Button
          type="submit"
          variant="primary"
          block
          loading={isPending}
          disabled={!canSubmit || isPending}
          data-testid="first-wallet-create"
        >
          {t('book.walletCreate')}
        </Button>
      </form>
    </Sheet>
  );
}
