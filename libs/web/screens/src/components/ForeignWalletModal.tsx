import type { JSX } from 'react';
import { formatMoney, type CurrencyCode } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/Button';
import { Modal } from '@cc/web-ui/components/Modal';

export interface ForeignWalletConfirm {
  minor: number;
  currency: CurrencyCode;
  walletName: string;
}

export interface ForeignWalletModalProps {
  confirm: ForeignWalletConfirm | null;
  onClose(): void;
  onSave(minor: number): void;
  onChangeWallet(): void;
  disabled?: boolean;
}

/** Asks once before a new Chi/Thu is saved in a non-VND wallet, so "35" for a coffee isn't 35 USDT. */
export function ForeignWalletModal({
  confirm,
  onClose,
  onSave,
  onChangeWallet,
  disabled = false,
}: ForeignWalletModalProps): JSX.Element {
  const t = useT();

  return (
    <Modal
      open={confirm !== null}
      onClose={onClose}
      title={t('personalEntry.foreignTitle', { currency: confirm?.currency ?? '' })}
    >
      {confirm !== null && (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground tabular-nums">
            {t('personalEntry.foreignBody', {
              amount: formatMoney(confirm.minor, confirm.currency),
              wallet: confirm.walletName,
            })}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              data-testid="foreign-change-wallet"
              disabled={disabled}
              onClick={onChangeWallet}
            >
              {t('personalEntry.foreignChangeWallet')}
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="foreign-save"
              disabled={disabled}
              onClick={() => onSave(confirm.minor)}
            >
              {t('personalEntry.foreignSave', {
                amount: formatMoney(confirm.minor, confirm.currency),
              })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
