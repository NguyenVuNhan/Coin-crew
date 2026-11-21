import { useEffect, useId, useState, type FormEvent, type JSX } from 'react';
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode, type WalletDetailView } from '@cc/core';
import { useLang, useT } from '@cc/web-i18n';
import { useAnswerBalanceCheck, useBalanceChecks, useWalletDetails } from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { Card } from '@cc/web-ui/components/ui/card';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';

const ZERO_TEXT_RE = /^(?:0+(?:[.,]0{1,2})?)?$/;

function parseBalanceInput(text: string, currency: CurrencyCode): { value: number | null; valid: boolean } {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, valid: false };

  const hasMinus = trimmed.startsWith('-') || trimmed.startsWith('\u2212');
  const unsigned = hasMinus ? trimmed.slice(1).trim() : trimmed;
  if (ZERO_TEXT_RE.test(unsigned) && unsigned !== '') {
    return { value: 0, valid: true };
  }
  if (hasMinus && unsigned === '') {
    return { value: null, valid: false };
  }
  const parsed = parseMoney(unsigned, currency);
  if (parsed === null) return { value: null, valid: false };
  return { value: hasMinus ? -parsed : parsed, valid: true };
}

function formatSignedDifference(diff: number, currency: CurrencyCode): string {
  if (diff < 0) return `\u2212${formatMoney(Math.abs(diff), currency)}`;
  if (diff > 0) return `+${formatMoney(diff, currency)}`;
  return formatMoney(0, currency);
}

export interface BalanceCheckPromptProps {
  /** When set, only show the prompt card for this wallet. */
  walletId?: string;
}

/** Prompts the owner to reconcile everyday wallet balances after re-enabling Sổ chi tiêu. */
export function BalanceCheckPrompt({ walletId }: BalanceCheckPromptProps): JSX.Element | null {
  const t = useT();
  const [lang] = useLang();
  const checksQuery = useBalanceChecks();
  const walletsQuery = useWalletDetails();
  const answer = useAnswerBalanceCheck();

  const amountId = useId();
  const amountErrorId = useId();

  const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
  const [skippingWalletId, setSkippingWalletId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [savedSnackbar, setSavedSnackbar] = useState(false);

  const openSheet = (id: string) => {
    setAmountText('');
    answer.reset();
    setActiveWalletId(id);
  };

  useEffect(() => {
    if (!savedSnackbar) return undefined;
    const timer = setTimeout(() => setSavedSnackbar(false), 4000);
    return () => clearTimeout(timer);
  }, [savedSnackbar]);

  const wallets = walletsQuery.data?.wallets ?? [];
  const walletMap = new Map(wallets.map((w) => [w.id, w]));
  const listedIds = checksQuery.data?.walletIds ?? [];
  const filteredIds = walletId ? listedIds.filter((id) => id === walletId) : listedIds;
  const targets: WalletDetailView[] = [];
  for (const id of filteredIds) {
    const w = walletMap.get(id);
    if (w) targets.push(w);
  }

  const activeWallet = activeWalletId ? (walletMap.get(activeWalletId) ?? null) : null;

  if (targets.length === 0 && !activeWallet && !savedSnackbar) {
    return null;
  }

  const parsed = activeWallet ? parseBalanceInput(amountText, activeWallet.currency) : { value: null, valid: false };
  const hasTyped = amountText.trim() !== '';
  const showInvalid = hasTyped && !parsed.valid;
  const resolvedActual = parsed.value;
  const diff = activeWallet && resolvedActual !== null ? resolvedActual - activeWallet.balance : null;

  const handleSkip = (wallet: WalletDetailView) => {
    if (answer.isPending) return;
    setSkippingWalletId(wallet.id);
    answer.mutate(
      { walletId: wallet.id, input: { skip: true } },
      {
        onSettled: () => setSkippingWalletId(null),
      },
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activeWallet || resolvedActual === null || answer.isPending) return;
    answer.mutate(
      { walletId: activeWallet.id, input: { actual: resolvedActual } },
      {
        onSuccess: () => {
          setActiveWalletId(null);
          setSavedSnackbar(true);
        },
      },
    );
  };

  const sheetTitle = activeWallet
    ? lang === 'vi'
      ? `Số dư thật của ${activeWallet.name}`
      : `Real balance of ${activeWallet.name}`
    : '';

  return (
    <>
      {targets.length > 0 && (
        <div data-testid="balance-check-list" className="fsl-balance-check flex flex-col gap-3">
          {targets.map((wallet) => {
            const isSkippingThis = answer.isPending && skippingWalletId === wallet.id;
            const balanceLabel =
              lang === 'vi'
                ? `${wallet.name} · trong app: ${formatMoney(wallet.balance, wallet.currency)}`
                : `${wallet.name} · in app: ${formatMoney(wallet.balance, wallet.currency)}`;

            return (
              <Card
                key={wallet.id}
                data-testid={`balance-check-card-${wallet.id}`}
                className="fsl-balance-check__card rounded-xl bg-card border border-border shadow-none ring-0 p-4 flex flex-col gap-2"
              >
                <div className="text-sm font-semibold text-foreground">{t('balanceCheck.question')}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{balanceLabel}</div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="primary"
                    data-testid={`balance-check-enter-${wallet.id}`}
                    disabled={answer.isPending}
                    onClick={() => openSheet(wallet.id)}
                  >
                    {t('balanceCheck.enter')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="border border-border"
                    data-testid={`balance-check-skip-${wallet.id}`}
                    loading={isSkippingThis}
                    disabled={answer.isPending}
                    onClick={() => handleSkip(wallet)}
                  >
                    {t('balanceCheck.skip')}
                  </Button>
                </div>
                {answer.error && skippingWalletId === wallet.id && <InlineError error={answer.error} />}
              </Card>
            );
          })}
        </div>
      )}

      <Sheet
        open={Boolean(activeWallet)}
        onClose={() => setActiveWalletId(null)}
        title={sheetTitle}
      >
        {activeWallet && (
          <form
            className="fsl-balance-check__form flex flex-col gap-4"
            data-testid="balance-check-form"
            noValidate
            onSubmit={handleSubmit}
          >
            <div className="fsl-field flex flex-col gap-1.5">
              <Label htmlFor={amountId}>{t('balanceCheck.enter')}</Label>
              <Input
                id={amountId}
                data-testid="balance-check-amount"
                type="text"
                inputMode={CURRENCIES[activeWallet.currency].decimals === 0 ? 'numeric' : 'decimal'}
                className="fsl-input fsl-input--amount text-base font-semibold tabular-nums"
                aria-invalid={showInvalid || undefined}
                aria-describedby={showInvalid ? amountErrorId : undefined}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
              />
              {showInvalid && (
                <div id={amountErrorId} role="alert" className="fsl-field-error text-sm text-danger">
                  {t('expenseForm.amountInvalid')}
                </div>
              )}
            </div>

            {resolvedActual !== null && diff !== null && (
              <div className="flex flex-col gap-1">
                <div
                  data-testid="balance-check-preview"
                  className="text-2xl font-bold tabular-nums text-right text-foreground"
                >
                  {formatMoney(resolvedActual, activeWallet.currency)}
                </div>
                <p data-testid="balance-check-diff" className="m-0 text-xs text-muted-foreground tabular-nums">
                  {diff === 0
                    ? lang === 'vi'
                      ? `Số dư đã khớp (chênh lệch ${formatMoney(0, activeWallet.currency)}).`
                      : `Balance matches (difference ${formatMoney(0, activeWallet.currency)}).`
                    : lang === 'vi'
                      ? `Chênh lệch ${formatSignedDifference(diff, activeWallet.currency)} sẽ được ghi là "Điều chỉnh số dư", không tính vào chi tiêu.`
                      : `Difference of ${formatSignedDifference(diff, activeWallet.currency)} will be recorded as "Balance adjustment", excluded from spending.`}
                </p>
              </div>
            )}

            {answer.error && <InlineError error={answer.error} />}

            <Button
              type="submit"
              variant="primary"
              block
              loading={answer.isPending}
              disabled={resolvedActual === null || answer.isPending}
              data-testid="balance-check-save"
            >
              {t('walletForm.save')}
            </Button>
          </form>
        )}
      </Sheet>

      {savedSnackbar && <Snackbar message={t('balanceCheck.saved')} />}
    </>
  );
}
