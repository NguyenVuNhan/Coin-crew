import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toTransferNote, type CreateTripInput, type GroupPreset, type Gender } from '@cc/core';
import { useT, useLang } from '@cc/web-i18n';
import { useMe } from '@cc/web-data-access/hooks';
import { apiSend } from '@cc/web-data-access/client';
import { Screen } from '../components/Screen';
import { ConsentSheet } from '../components/ConsentSheet';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { BankFields, type BankFieldsValue } from '../components/BankFields';
import { PeopleInput } from '../components/PeopleInput';
import { hideUndo } from '../components/UndoSnackbarHost';
import { Icon } from '@cc/web-ui/components/icons';
import type { PersonEntry } from '@cc/web-util/recentPeople';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';

export function CreateTrip() {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const meQuery = useMe();

  const user = meQuery.data?.user;

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  const [preset, setPreset] = useState<GroupPreset>('trip');
  const [tripName, setTripName] = useState('');
  const [people, setPeople] = useState<PersonEntry[]>([]);
  // A name typed in the add field but not added yet still joins the group.
  const [draft, setDraft] = useState('');
  // The gender Enter would add the typed name with, so a name typed but not added joins the same way (sport groups).
  const [draftGender, setDraftGender] = useState<Gender | null>(null);
  const onDraftChange = useCallback((text: string, gender: Gender | null) => {
    setDraft(text);
    setDraftGender(gender);
  }, []);
  const [myGender, setMyGender] = useState<Gender | null>(null);
  const effectiveMyGender = myGender ?? user?.gender ?? null;
  const [bank, setBank] = useState<BankFieldsValue>({
    bin: '',
    accountNumber: '',
    holderName: '',
  });
  const [submitError, setSubmitError] = useState<unknown>(null);

  const isFormValid = tripName.trim().length > 0;

  const createMutation = useMutation({
    mutationFn: (input: CreateTripInput) =>
      apiSend<{ tripId: string }>('/api/trips', 'POST', input),
    onSuccess: (data, variables) => {
      if (variables.myBank) {
        void queryClient.invalidateQueries({ queryKey: ['me', 'bank'] });
        void queryClient.invalidateQueries({ queryKey: ['trip'] });
        void queryClient.invalidateQueries({ queryKey: ['pay'] });
        void queryClient.invalidateQueries({ queryKey: ['expense-pay'] });
        void queryClient.invalidateQueries({ queryKey: ['me', 'people'] });
      }
      void queryClient.invalidateQueries({ queryKey: ['trips'] });
      navigate(`/t/${data.tripId}`, { replace: true });
    },
    onError: (err) => {
      setSubmitError(err);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isFormValid || createMutation.isPending) return;

    hideUndo();
    setSubmitError(null);
    const typedName = draft.trim();
    const roster: PersonEntry[] =
      typedName !== '' && typedName.length <= 40 ? [...people, { key: 'draft', name: typedName, gender: draftGender }] : people;
    const input: CreateTripInput = {
      name: tripName.trim(),
      defaultLang: lang,
      people: roster.flatMap((p) => {
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

    if (user?.name) {
      input.myName = user.name;
    }

    if (preset === 'sport') {
      input.preset = 'sport';
      if (effectiveMyGender) {
        input.myGender = effectiveMyGender;
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
        holderName: toTransferNote(bank.holderName, 50) || bank.holderName.trim(),
      };
    }

    createMutation.mutate(input);
  };

  return (
    <Screen
      title={t('create.title')}
      back="/groups"
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
          <Label htmlFor="fsl-trip-name" className={cn('fsl-form-label text-foreground')}>
            {t('create.tripName')}
          </Label>
          <Input
            id="fsl-trip-name"
            type="text"
            placeholder={preset === 'sport' ? t('create.sportNamePlaceholder') : t('create.tripNamePlaceholder')}
            maxLength={60}
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            className="fsl-input"
          />
        </div>

        <PeopleInput
          value={people}
          onChange={setPeople}
          showGender={preset === 'sport'}
          me={user ? { name: user.name, gender: effectiveMyGender, onGenderChange: setMyGender } : undefined}
          onDraftChange={onDraftChange}
        />

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
