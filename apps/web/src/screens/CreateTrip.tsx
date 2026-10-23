import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import type { CreateTripInput, GroupPreset, Gender } from '@fsl/core';
import { useT, useLang } from '../i18n';
import { useMe } from '../api/hooks';
import { apiFetch, apiSend } from '../api/client';
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
import './CreateTrip.css';

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
        className={`fsl-create-trip__form${submitError ? ' fsl-create-trip__form--bar-error' : ''}`}
      >
        <div
          role="radiogroup"
          aria-label={t('create.presetLabel')}
          className="fsl-create-trip__preset"
        >
          <button
            type="button"
            role="radio"
            aria-checked={preset === 'trip'}
            className={`fsl-create-trip__preset-btn${preset === 'trip' ? ' fsl-create-trip__preset-btn--selected' : ''}`}
            onClick={() => setPreset('trip')}
          >
            <Icon name="suitcase" size={18} />
            <span>{t('create.presetTrip')}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={preset === 'sport'}
            className={`fsl-create-trip__preset-btn${preset === 'sport' ? ' fsl-create-trip__preset-btn--selected' : ''}`}
            onClick={() => setPreset('sport')}
          >
            <Icon name="trophy" size={18} />
            <span>{t('create.presetSport')}</span>
          </button>
        </div>

        <div className="fsl-form-group">
          <label htmlFor="fsl-trip-name" className="fsl-form-label">
            {t('create.tripName')}
          </label>
          <input
            id="fsl-trip-name"
            type="text"
            placeholder={preset === 'sport' ? t('create.sportNamePlaceholder') : t('create.tripNamePlaceholder')}
            maxLength={60}
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            className="fsl-input"
          />
        </div>

        <div className="fsl-form-group">
          <label htmlFor="fsl-my-name" className="fsl-form-label">
            {t('create.myName')}
          </label>
          {meQuery.isLoading ? (
            <Skeleton height={44} radius="md" />
          ) : (
            <div className="fsl-create-trip__my-name-row">
              <input
                id="fsl-my-name"
                type="text"
                maxLength={40}
                value={myName}
                onChange={(e) => setUserEnteredMyName(e.target.value)}
                className="fsl-input"
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

        <details className="fsl-create-trip__details">
          <summary className="fsl-create-trip__summary">
            <span className="fsl-create-trip__summary-text">
              <span className="fsl-create-trip__summary-title">
                {t('create.bankTitle')}
              </span>
              <span className="fsl-create-trip__summary-hint">
                {t('create.bankHint')}
              </span>
            </span>
            <Icon name="chevronDown" size={20} className="fsl-create-trip__chevron" />
          </summary>
          <div className="fsl-create-trip__details-body">
            <BankFields value={bank} onChange={setBank} />
          </div>
        </details>
      </form>
    </Screen>
  );
}
