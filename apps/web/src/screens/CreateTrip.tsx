import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import type { CreateTripInput, GroupPreset, Gender } from '@fsl/core';
import { useT, useLang } from '../i18n';
import { useMe } from '../api/hooks';
import { apiSend } from '../api/client';
import { Screen } from '../components/Screen';
import { ConsentSheet } from '../components/ConsentSheet';
import { Button } from '../components/Button';
import { InlineError } from '../components/InlineError';
import { BankFields, type BankFieldsValue } from '../components/BankFields';
import { Skeleton } from '../components/Skeleton';
import { PeopleInput } from '../components/PeopleInput';
import { Icon } from '../components/icons';
import { GenderToggle } from '../components/GenderToggle';
import { newPersonEntry, type PersonEntry } from '../lib/recentPeople';
import { cn } from '@/lib/utils';

export function CreateTrip() {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();

  const meQuery = useMe();

  const user = meQuery.data?.user;

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  const [preset, setPreset] = useState<GroupPreset>('trip');
  const [tripName, setTripName] = useState('');
  const [userEnteredMyName, setUserEnteredMyName] = useState<string | null>(null);
  const myName = userEnteredMyName !== null ? userEnteredMyName : (user?.name ?? '');
  const [myGender, setMyGender] = useState<Gender | null>(null);
  const [people, setPeople] = useState<PersonEntry[]>(() => [newPersonEntry()]);
  const [bank, setBank] = useState<BankFieldsValue>({
    bin: '',
    accountNumber: '',
    holderName: '',
  });
  const [submitError, setSubmitError] = useState<unknown>(null);

  const isFormValid =
    tripName.trim().length > 0 &&
    myName.trim().length > 0 &&
    people.some((p) => p.name.trim().length > 0);

  const createMutation = useMutation({
    mutationFn: (input: CreateTripInput) =>
      apiSend<{ tripId: string }>('/api/trips', 'POST', input),
    onSuccess: (data) => {
      navigate(`/t/${data.tripId}`);
    },
    onError: (err) => {
      setSubmitError(err);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isFormValid || createMutation.isPending) return;

    setSubmitError(null);
    const input: CreateTripInput = {
      name: tripName.trim(),
      myName: myName.trim(),
      defaultLang: lang,
      people: people.flatMap((p) => {
        const name = p.name.trim();
        if (name === '') return [];
        if (preset === 'sport') {
          const personObj: { name: string; userId?: string; gender?: Gender } = { name };
          if (p.userId) personObj.userId = p.userId;
          if (p.gender) personObj.gender = p.gender;
          return [personObj];
        }
        return [p.userId ? { name, userId: p.userId } : { name }];
      }),
    };

    if (preset === 'sport') {
      input.preset = 'sport';
      if (myGender) {
        input.myGender = myGender;
      }
    }

    if (
      bank.bin.trim() !== '' &&
      bank.accountNumber.trim() !== '' &&
      bank.holderName.trim() !== ''
    ) {
      input.myBank = {
        bin: bank.bin.trim(),
        accountNumber: bank.accountNumber.trim(),
        holderName: bank.holderName.trim(),
      };
    }

    createMutation.mutate(input);
  };

  return (
    <Screen
      title={t('create.title')}
      back="/trips"
      bottomBar={
        <>
          {submitError ? <InlineError error={submitError} /> : null}
          <Button
            type="submit"
            form="create-trip-form"
            variant="primary"
            block
            disabled={!isFormValid || createMutation.isPending}
            loading={createMutation.isPending}
          >
            {t('create.submit')}
          </Button>
        </>
      }
    >
      <ConsentSheet />
      <form
        id="create-trip-form"
        onSubmit={handleSubmit}
        className={cn(
          'fsl-create-trip__form flex flex-col gap-5 py-4',
          !!submitError && 'fsl-create-trip__form--bar-error max-lg:pb-24',
        )}
      >
        <div
          role="radiogroup"
          aria-label={t('create.presetLabel')}
          className={cn('fsl-create-trip__preset grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl border border-border')}
        >
          <button
            type="button"
            role="radio"
            aria-checked={preset === 'trip'}
            className={cn(
              'fsl-create-trip__preset-btn inline-flex items-center justify-center gap-2 min-h-11 px-3 py-2 rounded-lg border text-base cursor-pointer select-none transition-all active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              preset === 'trip'
                ? 'fsl-create-trip__preset-btn--selected bg-card text-foreground font-semibold border-border shadow-xs'
                : 'border-transparent bg-transparent text-muted-foreground font-medium hover:text-foreground',
            )}
            onClick={() => setPreset('trip')}
          >
            <Icon name="suitcase" size={18} />
            <span>{t('create.presetTrip')}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={preset === 'sport'}
            className={cn(
              'fsl-create-trip__preset-btn inline-flex items-center justify-center gap-2 min-h-11 px-3 py-2 rounded-lg border text-base cursor-pointer select-none transition-all active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              preset === 'sport'
                ? 'fsl-create-trip__preset-btn--selected bg-card text-foreground font-semibold border-border shadow-xs'
                : 'border-transparent bg-transparent text-muted-foreground font-medium hover:text-foreground',
            )}
            onClick={() => setPreset('sport')}
          >
            <Icon name="trophy" size={18} />
            <span>{t('create.presetSport')}</span>
          </button>
        </div>

        <div className={cn('fsl-form-group flex flex-col gap-1.5')}>
          <label htmlFor="fsl-trip-name" className={cn('fsl-form-label text-sm font-medium text-foreground')}>
            {t('create.tripName')}
          </label>
          <input
            id="fsl-trip-name"
            type="text"
            placeholder={preset === 'sport' ? t('create.sportNamePlaceholder') : t('create.tripNamePlaceholder')}
            maxLength={60}
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            className={cn(
              'fsl-input h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            )}
          />
        </div>

        <div className={cn('fsl-form-group flex flex-col gap-1.5')}>
          <label htmlFor="fsl-my-name" className={cn('fsl-form-label text-sm font-medium text-foreground')}>
            {t('create.myName')}
          </label>
          {meQuery.isLoading ? (
            <Skeleton height={44} radius="xl" />
          ) : (
            <div className={cn('fsl-create-trip__my-name-row flex items-center gap-2')}>
              <input
                id="fsl-my-name"
                type="text"
                maxLength={40}
                value={myName}
                onChange={(e) => setUserEnteredMyName(e.target.value)}
                className={cn(
                  'fsl-input h-11 w-full flex-1 min-w-0 rounded-xl border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                )}
              />
              {preset === 'sport' && (
                <GenderToggle
                  name={myName.trim() || t('create.myName')}
                  value={myGender}
                  onChange={setMyGender}
                />
              )}
            </div>
          )}
        </div>

        <PeopleInput value={people} onChange={setPeople} showGender={preset === 'sport'} />

        <details className={cn('fsl-create-trip__details group rounded-xl border border-border bg-card overflow-hidden')}>
          <summary
            className={cn(
              'fsl-create-trip__summary flex items-center justify-between gap-3 min-h-11 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl',
            )}
          >
            <span className={cn('fsl-create-trip__summary-text flex flex-col gap-0.5 min-w-0')}>
              <span className={cn('fsl-create-trip__summary-title text-base font-medium text-foreground')}>
                {t('create.bankTitle')}
              </span>
              <span className={cn('fsl-create-trip__summary-hint text-xs text-subtle-foreground')}>
                {t('create.bankHint')}
              </span>
            </span>
            <Icon
              name="chevronDown"
              size={20}
              className={cn(
                'fsl-create-trip__chevron shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180',
              )}
            />
          </summary>
          <div className={cn('fsl-create-trip__details-body mx-4 py-4 border-t border-border')}>
            <BankFields value={bank} onChange={setBank} />
          </div>
        </details>
      </form>
    </Screen>
  );
}
