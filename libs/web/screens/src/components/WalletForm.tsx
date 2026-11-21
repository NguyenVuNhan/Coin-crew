import { useState, useId, useRef, useEffect, type JSX, type FormEvent } from 'react';
import {
  CURRENCIES,
  formatMoney,
  formatVnd,
  parseMoney,
  parseVnd,
  type CurrencyCode,
  type WalletDetailView,
  type WalletKind,
} from '@cc/core';
import { useLang, useT } from '@cc/web-i18n';
import { useAddWallet, useUpdateWallet } from '@cc/web-data-access/personalMoney';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { cn } from '@cc/web-ui/lib/utils';
import { CurrencyBadge } from './CurrencyBadge';
import { CurrencyPickerSheet } from './CurrencyPickerSheet';
import { WalletIcon } from './WalletIcon';
import { WalletIconPickerSheet } from './WalletIconPickerSheet';

export { walletIconClass } from './WalletIcon';

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

export interface WalletFormProps {
  open: boolean;
  onClose: () => void;
  wallet?: WalletDetailView;
}

export function WalletForm({ open, onClose, wallet }: WalletFormProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const addWallet = useAddWallet();
  const updateWallet = useUpdateWallet();

  const isEdit = Boolean(wallet);
  const locked = Boolean(wallet && wallet.entryCount > 0);

  const nameId = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const costVndId = useId();
  const excludeId = useId();

  const [name, setName] = useState(wallet?.name ?? '');
  const [kind, setKind] = useState<WalletKind>(wallet?.kind ?? 'everyday');
  const [currency, setCurrency] = useState<CurrencyCode>(wallet?.currency ?? 'VND');
  const [amountText, setAmountText] = useState(() =>
    wallet ? formatMinorInput(wallet.startAmount, wallet.currency) : '',
  );
  const [costVndText, setCostVndText] = useState(() =>
    wallet?.startCostVnd ? String(wallet.startCostVnd) : '',
  );
  const [icon, setIcon] = useState<string>(wallet?.icon ?? 'bg-avatar-5');
  const [excludeFromReports, setExcludeFromReports] = useState<boolean>(
    Boolean(wallet?.excludeFromReports),
  );
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setName(wallet?.name ?? '');
      setKind(wallet?.kind ?? 'everyday');
      setCurrency(wallet?.currency ?? 'VND');
      setAmountText(wallet ? formatMinorInput(wallet.startAmount, wallet.currency) : '');
      setCostVndText(wallet?.startCostVnd ? String(wallet.startCostVnd) : '');
      setIcon(wallet?.icon ?? 'bg-avatar-5');
      setExcludeFromReports(Boolean(wallet?.excludeFromReports));
      setCurrencyPickerOpen(false);
      setIconPickerOpen(false);
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
    isCostVndValid &&
    (!showCostVnd || resolvedCostVnd !== null);

  const isPending = addWallet.isPending || updateWallet.isPending;
  const activeError = isEdit ? updateWallet.error : addWallet.error;
  const currencyInfo = CURRENCIES[currency];
  const currencyName = lang === 'vi' ? currencyInfo.nameVi : currencyInfo.nameEn;

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
            startCostVnd: showCostVnd ? resolvedCostVnd : null,
            icon,
            excludeFromReports,
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
        startCostVnd: showCostVnd ? resolvedCostVnd : null,
        icon,
        excludeFromReports,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
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
          {/* Row 1: Logo + Wallet Name */}
          <div className="fsl-field flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={nameId}>{t('walletForm.name')}</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {`${name.length}/40`}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                data-testid="wallet-form-icon-trigger"
                aria-label={t('walletForm.changeIcon')}
                onClick={() => setIconPickerOpen(true)}
                className="relative size-11 min-h-11 min-w-11 shrink-0 rounded-xl grid place-items-center cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <WalletIcon icon={icon} size="md" />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-card border border-border grid place-items-center text-muted-foreground"
                >
                  <Icon name="edit" size={10} />
                </span>
              </button>
              <Input
                id={nameId}
                data-testid="wallet-form-name"
                maxLength={40}
                autoComplete="off"
                className="fsl-input flex-1 text-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Currency */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label>{t('walletForm.currency')}</Label>
            <button
              type="button"
              disabled={locked}
              data-testid="wallet-form-currency-trigger"
              onClick={() => setCurrencyPickerOpen(true)}
              className="min-h-12 w-full rounded-xl border border-border bg-card px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors hover:bg-muted cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-3 min-w-0">
                <CurrencyBadge code={currency} size="sm" />
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {currencyName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {`${currency} · ${currencyInfo.symbol}`}
                  </span>
                </span>
              </span>
              {!locked && (
                <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
              )}
            </button>
            {locked && (
              <p className="m-0 text-xs text-muted-foreground">{t('walletForm.lockedHint')}</p>
            )}
          </div>

          {/* Row 3: Starting balance + conditional VND cost basis */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label htmlFor={amountId}>{t('walletForm.startAmount')}</Label>
            <Input
              id={amountId}
              data-testid="wallet-form-amount"
              type="text"
              inputMode="text"
              className="fsl-input fsl-input--amount text-base font-semibold tabular-nums"
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

          {showCostVnd && (
            <div className="fsl-field flex flex-col gap-1.5">
              <Label htmlFor={costVndId}>{t('walletForm.startCostVnd')}</Label>
              <Input
                id={costVndId}
                data-testid="wallet-form-cost-vnd"
                type="text"
                inputMode="decimal"
                className="fsl-input fsl-input--amount text-base font-semibold tabular-nums"
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

          {/* Options: Kind + Exclude from total reports */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label>{t('walletForm.options')}</Label>
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              <div className="px-3.5 py-3 flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{t('walletForm.kind')}</span>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="group"
                  aria-label={t('walletForm.kind')}
                >
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

              <div className="px-3.5 py-3 flex items-center justify-between gap-3">
                <Label
                  htmlFor={excludeId}
                  className="flex flex-col items-start gap-0.5 min-w-0 font-normal cursor-pointer"
                >
                  <span className="text-sm font-medium text-foreground">
                    {t('walletForm.excludeFromReports')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('walletForm.excludeFromReportsHint')}
                  </span>
                </Label>
                <Switch
                  id={excludeId}
                  data-testid="wallet-form-exclude-reports"
                  checked={excludeFromReports}
                  onCheckedChange={setExcludeFromReports}
                />
              </div>
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

      <CurrencyPickerSheet
        open={currencyPickerOpen}
        onClose={() => setCurrencyPickerOpen(false)}
        value={currency}
        onSelect={setCurrency}
      />

      <WalletIconPickerSheet
        open={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        value={icon}
        onSelect={setIcon}
      />
    </>
  );
}
