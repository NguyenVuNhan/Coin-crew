import { useState, useId, useRef, useEffect, type JSX, type FormEvent } from 'react';
import {
  CURRENCIES,
  CURRENCY_CODES,
  formatMoney,
  formatVnd,
  parseMoney,
  parseVnd,
  type CurrencyCode,
  type WalletDetailView,
  type WalletKind,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { useAddWallet, useUpdateWallet } from '@cc/web-data-access/personalMoney';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { cn } from '@cc/web-ui/lib/utils';

export const WALLET_ICON_CLASSES = [
  'bg-avatar-1 text-avatar-1-fg',
  'bg-avatar-2 text-avatar-2-fg',
  'bg-avatar-3 text-avatar-3-fg',
  'bg-avatar-4 text-avatar-4-fg',
  'bg-avatar-5 text-avatar-5-fg',
  'bg-avatar-6 text-avatar-6-fg',
] as const;

export const WALLET_ICON_IDS = [
  'bg-avatar-1',
  'bg-avatar-2',
  'bg-avatar-3',
  'bg-avatar-4',
  'bg-avatar-5',
  'bg-avatar-6',
] as const;

const ZERO_TEXT_RE = /^(?:0+(?:[.,]0{1,2})?)?$/;

function formatMinorInput(minor: number, currency: CurrencyCode): string {
  const abs = Math.abs(Math.trunc(minor));
  if (abs === 0) return '';
  const sign = minor < 0 ? '-' : '';
  if (CURRENCIES[currency].decimals === 0) return `${sign}${abs}`;
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return frac === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

export function walletIconClass(icon: string | null | undefined): string {
  const idx = WALLET_ICON_IDS.indexOf((icon ?? '') as (typeof WALLET_ICON_IDS)[number]);
  return WALLET_ICON_CLASSES[idx >= 0 ? idx : 4] ?? WALLET_ICON_CLASSES[4];
}

export interface WalletFormProps {
  open: boolean;
  onClose: () => void;
  wallet?: WalletDetailView;
}

export function WalletForm({ open, onClose, wallet }: WalletFormProps): JSX.Element {
  const t = useT();
  const addWallet = useAddWallet();
  const updateWallet = useUpdateWallet();

  const isEdit = Boolean(wallet);
  const locked = Boolean(wallet && wallet.entryCount > 0);

  const nameId = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const dateId = useId();
  const costVndId = useId();

  const [name, setName] = useState(wallet?.name ?? '');
  const [kind, setKind] = useState<WalletKind>(wallet?.kind ?? 'everyday');
  const [currency, setCurrency] = useState<CurrencyCode>(wallet?.currency ?? 'VND');
  const [amountText, setAmountText] = useState(() =>
    wallet ? formatMinorInput(wallet.startAmount, wallet.currency) : '',
  );
  const [startDate, setStartDate] = useState(wallet?.startDate ?? todayLocal());
  const [costVndText, setCostVndText] = useState(() =>
    wallet?.startCostVnd ? String(wallet.startCostVnd) : '',
  );
  const [icon, setIcon] = useState<string>(wallet?.icon ?? 'bg-avatar-5');

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setName(wallet?.name ?? '');
      setKind(wallet?.kind ?? 'everyday');
      setCurrency(wallet?.currency ?? 'VND');
      setAmountText(wallet ? formatMinorInput(wallet.startAmount, wallet.currency) : '');
      setStartDate(wallet?.startDate ?? todayLocal());
      setCostVndText(wallet?.startCostVnd ? String(wallet.startCostVnd) : '');
      setIcon(wallet?.icon ?? 'bg-avatar-5');
      addWallet.reset();
      updateWallet.reset();
    }
    prevOpenRef.current = open;
  }, [open, wallet, addWallet, updateWallet]);

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

  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length >= 1 &&
    trimmedName.length <= 40 &&
    isAmountValid &&
    resolvedAmount !== null &&
    startDate.length === 10 &&
    isCostVndValid &&
    (!showCostVnd || resolvedCostVnd !== null);

  const isPending = addWallet.isPending || updateWallet.isPending;
  const activeError = isEdit ? updateWallet.error : addWallet.error;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isPending || resolvedAmount === null) return;

    if (wallet) {
      updateWallet.mutate(
        {
          id: wallet.id,
          input: {
            name: trimmedName,
            startAmount: resolvedAmount,
            startDate,
            startCostVnd: showCostVnd ? resolvedCostVnd : null,
            icon,
            ...(locked ? {} : { kind, currency }),
          },
        },
        { onSuccess: onClose },
      );
      return;
    }

    addWallet.mutate(
      {
        name: trimmedName,
        kind,
        currency,
        startAmount: resolvedAmount,
        startDate,
        startCostVnd: showCostVnd ? resolvedCostVnd : null,
        icon,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? t('walletForm.editTitle') : t('walletForm.newTitle')}
    >
      <form
        className="fsl-wallet-form flex flex-col gap-4"
        data-testid="wallet-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="fsl-field flex flex-col gap-1.5">
          <Label htmlFor={nameId}>{t('walletForm.name')}</Label>
          <Input
            id={nameId}
            data-testid="wallet-form-name"
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
                disabled={locked}
                data-testid={`wallet-form-kind-${k}`}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
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
                disabled={locked}
                data-testid={`wallet-form-currency-${c}`}
                aria-pressed={currency === c}
                onClick={() => setCurrency(c)}
                className={cn(
                  'min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
                  currency === c
                    ? 'border-primary bg-secondary text-secondary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {locked && (
            <p className="m-0 text-xs text-muted-foreground">{t('walletForm.lockedHint')}</p>
          )}
        </div>

        <div className="fsl-field flex flex-col gap-1.5">
          <Label htmlFor={amountId}>{t('walletForm.startAmount')}</Label>
          <Input
            id={amountId}
            data-testid="wallet-form-amount"
            type="text"
            inputMode="text"
            className="fsl-input fsl-input--amount font-semibold tabular-nums"
            aria-describedby={!isAmountValid ? amountErrorId : undefined}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
          {trimmedAmount !== '' && isAmountValid && resolvedAmount !== null && (
            <div className="fsl-amount-preview text-sm font-semibold tabular-nums text-muted-foreground">
              {formatMoney(resolvedAmount, currency)}
            </div>
          )}
          {!isAmountValid && (
            <div id={amountErrorId} role="alert" className="fsl-field-error text-sm text-danger">
              {t('expenseForm.amountInvalid')}
            </div>
          )}
        </div>

        <div className="fsl-field flex flex-col gap-1.5">
          <Label htmlFor={dateId}>{t('walletForm.startDate')}</Label>
          <Input
            id={dateId}
            data-testid="wallet-form-date"
            type="date"
            className="fsl-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        {showCostVnd && (
          <div className="fsl-field flex flex-col gap-1.5">
            <Label htmlFor={costVndId}>{t('walletForm.startCostVnd')}</Label>
            <Input
              id={costVndId}
              data-testid="wallet-form-cost-vnd"
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

        <div className="fsl-field flex flex-col gap-1.5">
          <Label>{t('walletForm.icon')}</Label>
          <div className="flex items-center gap-2" role="group" aria-label={t('walletForm.icon')}>
            {WALLET_ICON_IDS.map((id, idx) => (
              <button
                key={id}
                type="button"
                data-testid={`wallet-form-icon-${idx + 1}`}
                aria-label={id}
                aria-pressed={icon === id}
                onClick={() => setIcon(id)}
                className={cn(
                  'size-11 rounded-xl grid place-items-center transition-all cursor-pointer',
                  WALLET_ICON_CLASSES[idx],
                  icon === id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'opacity-80 hover:opacity-100',
                )}
              >
                <Icon name="wallet" size={18} />
              </button>
            ))}
          </div>
        </div>

        {activeError && <InlineError error={activeError} />}

        <Button
          type="submit"
          variant="primary"
          block
          loading={isPending}
          disabled={!canSubmit || isPending}
          data-testid="wallet-form-submit"
        >
          {t('walletForm.save')}
        </Button>
      </form>
    </Sheet>
  );
}
