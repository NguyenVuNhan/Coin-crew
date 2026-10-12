import { useState, useEffect } from 'react';
import { BANKS, toTransferNote } from '@fsl/core';
import { useT } from '../i18n';
import './BankFields.css';

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
    <div className="fsl-bank-fields">
      <div className="fsl-bank-fields__group">
        <label htmlFor="fsl-bank-select" className="fsl-bank-fields__label">
          {t('bank.bank')}
        </label>
        <select
          id="fsl-bank-select"
          value={value.bin}
          onChange={(e) => onChange({ ...value, bin: e.target.value })}
          className="fsl-bank-fields__select"
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
      </div>

      <div className="fsl-bank-fields__group">
        <label htmlFor="fsl-bank-account-number" className="fsl-bank-fields__label">
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
          className="fsl-bank-fields__input"
        />
      </div>

      <div className="fsl-bank-fields__group">
        <label htmlFor="fsl-bank-holder-name" className="fsl-bank-fields__label">
          {t('bank.holderName')}
        </label>
        <span id="fsl-bank-holder-hint" className="fsl-bank-fields__hint">
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
          className="fsl-bank-fields__input"
        />
      </div>
    </div>
  );
}
