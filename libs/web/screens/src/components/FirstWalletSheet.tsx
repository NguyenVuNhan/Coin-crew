import { useState, useId, useRef, useEffect, type JSX, type FormEvent } from 'react';
import { formatVnd, parseVnd, MAX_WALLET_AMOUNT } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useCreateWallet } from '@cc/web-data-access/personal';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { InlineError } from '@cc/web-ui/components/InlineError';

export function FirstWalletSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const create = useCreateWallet();

  const nameId = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const amountHintId = useId();

  const [name, setName] = useState(() => t('book.walletNameDefault'));
  const [amountText, setAmountText] = useState('');

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setName(t('book.walletNameDefault'));
      setAmountText('');
      create.reset();
    }
    prevOpenRef.current = open;
  }, [open, t, create]);

  const trimmedAmount = amountText.trim();
  const isZeroAmount = trimmedAmount === '' || /^0+$/.test(trimmedAmount);
  let resolvedAmount: number | null = null;
  let isAmountValid = false;

  if (isZeroAmount) {
    resolvedAmount = 0;
    isAmountValid = true;
  } else {
    const parsed = parseVnd(amountText);
    if (parsed !== null && parsed <= MAX_WALLET_AMOUNT) {
      resolvedAmount = parsed;
      isAmountValid = true;
    } else {
      resolvedAmount = null;
      isAmountValid = false;
    }
  }

  const isAmountInvalid = !isAmountValid;
  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length >= 1 &&
    trimmedName.length <= 40 &&
    isAmountValid &&
    resolvedAmount !== null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || create.isPending || resolvedAmount === null) return;
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
          <Label htmlFor={amountId}>{t('book.walletAmount')}</Label>
          <Input
            id={amountId}
            data-testid="first-wallet-amount"
            type="text"
            inputMode="decimal"
            className="fsl-input fsl-input--amount font-semibold tabular-nums"
            aria-describedby={isAmountInvalid ? amountErrorId : amountHintId}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
          {trimmedAmount !== '' && isAmountValid && resolvedAmount !== null && (
            <div className="fsl-amount-preview text-sm font-semibold tabular-nums text-muted-foreground">
              {formatVnd(resolvedAmount)}
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

        {create.error && <InlineError error={create.error} />}

        <Button
          type="submit"
          variant="primary"
          block
          loading={create.isPending}
          disabled={!canSubmit || create.isPending}
          data-testid="first-wallet-create"
        >
          {t('book.walletCreate')}
        </Button>
      </form>
    </Sheet>
  );
}
