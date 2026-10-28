import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { BANKS, toTransferNote } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';

export interface BankFieldsValue {
  bin: string;
  accountNumber: string;
  holderName: string;
}

const POPULAR_BINS = [
  '970436', // Vietcombank
  '970407', // Techcombank
  '970422', // MBBank
  '970415', // VietinBank
  '970418', // BIDV
  '970416', // ACB
  '970432', // VPBank
  '970423', // TPBank
  '970403', // Sacombank
  '970441', // VIB
];

const POPULAR_BANKS = POPULAR_BINS.map((bin) =>
  BANKS.find((b) => b.bin === bin),
).filter((b): b is NonNullable<typeof b> => Boolean(b));

const ALL_BANKS_SORTED = [...BANKS].sort((a, b) =>
  a.shortName.localeCompare(b.shortName),
);

export function BankFields({
  value,
  onChange,
}: {
  value: BankFieldsValue;
  onChange(v: BankFieldsValue): void;
}) {
  const t = useT();
  const [rawHolderName, setRawHolderName] = useState(value.holderName);

  useEffect(() => {
    setRawHolderName(value.holderName);
  }, [value.holderName]);

  const handleHolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setRawHolderName(text);
    onChange({ ...value, holderName: text });
  };

  const handleHolderBlur = () => {
    const converted = toTransferNote(rawHolderName, 50);
    setRawHolderName(converted);
    onChange({ ...value, holderName: converted });
  };

  return (
    <div className={cn('fsl-bank-fields flex flex-col gap-4 w-full')}>
      <div className={cn('fsl-bank-fields__group flex flex-col gap-1.5')}>
        <label htmlFor="fsl-bank-select" className={cn('fsl-bank-fields__label text-sm font-medium text-foreground')}>
          {t('bank.bank')}
        </label>
        <div className="relative w-full">
          <select
            id="fsl-bank-select"
            value={value.bin}
            onChange={(e) => onChange({ ...value, bin: e.target.value })}
            className={cn(
              'fsl-bank-fields__select h-11 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-10 text-base text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <option value="" disabled>
              {t('bank.choose')}
            </option>
            <optgroup label={t('bank.popular')}>
              {POPULAR_BANKS.map((b) => (
                <option key={`pop-${b.bin}`} value={b.bin}>
                  {`${b.shortName} — ${b.name}`}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('bank.allBanks')}>
              {ALL_BANKS_SORTED.map((b) => (
                <option key={`all-${b.bin}`} value={b.bin}>
                  {`${b.shortName} — ${b.name}`}
                </option>
              ))}
            </optgroup>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </div>

      <div className={cn('fsl-bank-fields__group flex flex-col gap-1.5')}>
        <label htmlFor="fsl-bank-account-number" className={cn('fsl-bank-fields__label text-sm font-medium text-foreground')}>
          {t('bank.accountNumber')}
        </label>
        <input
          id="fsl-bank-account-number"
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={19}
          value={value.accountNumber}
          onChange={(e) => {
            const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 19);
            onChange({ ...value, accountNumber: digitsOnly });
          }}
          className={cn(
            'fsl-bank-fields__input h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      </div>

      <div className={cn('fsl-bank-fields__group flex flex-col gap-1.5')}>
        <label htmlFor="fsl-bank-holder-name" className={cn('fsl-bank-fields__label text-sm font-medium text-foreground')}>
          {t('bank.holderName')}
        </label>
        <span id="fsl-bank-holder-hint" className={cn('fsl-bank-fields__hint text-sm text-muted-foreground')}>
          {t('bank.holderHint')}
        </span>
        <input
          id="fsl-bank-holder-name"
          type="text"
          aria-describedby="fsl-bank-holder-hint"
          autoCapitalize="characters"
          value={rawHolderName}
          onChange={handleHolderChange}
          onBlur={handleHolderBlur}
          className={cn(
            'fsl-bank-fields__input h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      </div>
    </div>
  );
}
