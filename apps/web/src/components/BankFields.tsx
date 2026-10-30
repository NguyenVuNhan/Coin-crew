import { useState, useEffect } from 'react';
import { BANKS, toTransferNote, normalizeName } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ChevronDown } from 'lucide-react';

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
  '970443', // SHB
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
  const [open, setOpen] = useState(false);
  const [rawHolderName, setRawHolderName] = useState(value.holderName);

  const selectedBank = BANKS.find((b) => b.bin === value.bin);

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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              id="fsl-bank-select"
              role="combobox"
              aria-expanded={open}
              className={cn(
                'fsl-bank-fields__select h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-left flex items-center justify-between gap-2 outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              )}
            >
              {selectedBank ? (
                <span className="truncate">{`${selectedBank.shortName} — ${selectedBank.name}`}</span>
              ) : (
                <span className="text-muted-foreground">{t('bank.choose')}</span>
              )}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
            <Command
              filter={(itemValue, search, keywords) =>
                normalizeName([...(keywords ?? [])].join(' ')).includes(normalizeName(search)) ? 1 : 0
              }
            >
              <CommandInput placeholder={t('bank.search')} className="text-base" />
              <CommandList className="max-h-72">
                <CommandEmpty>{t('bank.noResults')}</CommandEmpty>
                <CommandGroup heading={t('bank.popular')}>
                  {POPULAR_BANKS.map((b) => (
                    <CommandItem
                      key={`pop-${b.bin}`}
                      value={`pop-${b.bin}`}
                      keywords={[b.shortName, b.name, b.code]}
                      data-checked={b.bin === value.bin}
                      onSelect={() => {
                        onChange({ ...value, bin: b.bin });
                        setOpen(false);
                      }}
                      className="min-h-11 text-base"
                    >
                      {`${b.shortName} — ${b.name}`}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading={t('bank.allBanks')}>
                  {ALL_BANKS_SORTED.map((b) => (
                    <CommandItem
                      key={`all-${b.bin}`}
                      value={`all-${b.bin}`}
                      keywords={[b.shortName, b.name, b.code]}
                      data-checked={b.bin === value.bin}
                      onSelect={() => {
                        onChange({ ...value, bin: b.bin });
                        setOpen(false);
                      }}
                      className="min-h-11 text-base"
                    >
                      {`${b.shortName} — ${b.name}`}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
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
