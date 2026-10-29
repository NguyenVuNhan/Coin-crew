import { useState, useEffect } from 'react';
import { BANKS, toTransferNote } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select';

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
        <Label htmlFor="fsl-bank-select" className={cn('fsl-bank-fields__label text-foreground')}>
          {t('bank.bank')}
        </Label>
        <NativeSelect
          id="fsl-bank-select"
          value={value.bin}
          onChange={(e) => onChange({ ...value, bin: e.target.value })}
          className="fsl-bank-fields__select"
        >
          <NativeSelectOption value="" disabled>
            {t('bank.choose')}
          </NativeSelectOption>
          <NativeSelectOptGroup label={t('bank.popular')}>
            {POPULAR_BANKS.map((b) => (
              <NativeSelectOption key={`pop-${b.bin}`} value={b.bin}>
                {`${b.shortName} — ${b.name}`}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
          <NativeSelectOptGroup label={t('bank.allBanks')}>
            {ALL_BANKS_SORTED.map((b) => (
              <NativeSelectOption key={`all-${b.bin}`} value={b.bin}>
                {`${b.shortName} — ${b.name}`}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        </NativeSelect>
      </div>

      <div className={cn('fsl-bank-fields__group flex flex-col gap-1.5')}>
        <Label htmlFor="fsl-bank-account-number" className={cn('fsl-bank-fields__label text-foreground')}>
          {t('bank.accountNumber')}
        </Label>
        <Input
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
          className={cn('fsl-bank-fields__input')}
        />
      </div>

      <div className={cn('fsl-bank-fields__group flex flex-col gap-1.5')}>
        <Label htmlFor="fsl-bank-holder-name" className={cn('fsl-bank-fields__label text-foreground')}>
          {t('bank.holderName')}
        </Label>
        <span id="fsl-bank-holder-hint" className={cn('fsl-bank-fields__hint text-sm text-muted-foreground')}>
          {t('bank.holderHint')}
        </span>
        <Input
          id="fsl-bank-holder-name"
          type="text"
          aria-describedby="fsl-bank-holder-hint"
          autoCapitalize="characters"
          value={rawHolderName}
          onChange={handleHolderChange}
          onBlur={handleHolderBlur}
          className={cn('fsl-bank-fields__input')}
        />
      </div>
    </div>
  );
}
