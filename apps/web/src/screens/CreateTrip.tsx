import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { CreateTripInput } from '@fsl/core';
import { useT } from '../i18n';
import { apiFetch, apiSend } from '../api/client';
import { Screen } from '../components/Screen';
import { ConsentSheet } from '../components/ConsentSheet';
import { Button } from '../components/Button';
import { InlineError } from '../components/InlineError';
import { BankFields, type BankFieldsValue } from '../components/BankFields';
import { Skeleton } from '../components/Skeleton';
import './CreateTrip.css';

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    consentAt: string | null;
  } | null;
}

export function CreateTrip() {
  const t = useT();
  const navigate = useNavigate();

  const meQuery = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/api/me'),
  });

  const user = meQuery.data?.user;

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  const [tripName, setTripName] = useState('');
  const [userEnteredMyName, setUserEnteredMyName] = useState<string | null>(null);
  const myName = userEnteredMyName !== null ? userEnteredMyName : (user?.name ?? '');
  const [others, setOthers] = useState<string[]>(['']);
  const [bank, setBank] = useState<BankFieldsValue>({
    bin: '',
    accountNumber: '',
    holderName: '',
  });
  const [submitError, setSubmitError] = useState<unknown>(null);

  const handleOtherChange = (index: number, val: string) => {
    setOthers((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleAddPerson = () => {
    setOthers((prev) => [...prev, '']);
  };

  const handleRemovePerson = (index: number) => {
    setOthers((prev) => prev.filter((_, i) => i !== index));
  };

  const isFormValid =
    tripName.trim().length > 0 &&
    myName.trim().length > 0 &&
    others.some((p) => p.trim().length > 0);

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
    const people = others.map((p) => p.trim()).filter(Boolean);
    const input: CreateTripInput = {
      name: tripName.trim(),
      myName: myName.trim(),
      people,
    };

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
    <Screen title={t('create.title')} back="/trips">
      <ConsentSheet />
      <form onSubmit={handleSubmit} className="fsl-create-trip__form">
        <div className="fsl-form-group">
          <label htmlFor="fsl-trip-name" className="fsl-form-label">
            {t('create.tripName')}
          </label>
          <input
            id="fsl-trip-name"
            type="text"
            placeholder={t('create.tripNamePlaceholder')}
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
            <input
              id="fsl-my-name"
              type="text"
              maxLength={40}
              value={myName}
              onChange={(e) => setUserEnteredMyName(e.target.value)}
              className="fsl-input"
            />
          )}
        </div>

        <div className="fsl-form-group">
          <label htmlFor="fsl-other-0" className="fsl-form-label">
            {t('create.others')}
          </label>
          <div className="fsl-create-trip__others-list">
            {others.map((person, index) => {
              const placeholder = t('create.otherPlaceholder');
              const ariaLabel = `${placeholder} ${index + 1}`;
              const removeLabel = t('create.removePerson', {
                name: person.trim() || String(index + 1),
              });

              return (
                <div key={index} className="fsl-create-trip__person-row">
                  <input
                    id={index === 0 ? 'fsl-other-0' : undefined}
                    type="text"
                    placeholder={placeholder}
                    aria-label={ariaLabel}
                    value={person}
                    onChange={(e) => handleOtherChange(index, e.target.value)}
                    className="fsl-input"
                  />
                  {index > 0 && (
                    <button
                      type="button"
                      className="fsl-icon-button"
                      aria-label={removeLabel}
                      onClick={() => handleRemovePerson(index)}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleAddPerson}
            className="fsl-create-trip__add-person"
          >
            {t('create.addPerson')}
          </Button>
        </div>

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
          </summary>
          <div className="fsl-create-trip__details-body">
            <BankFields value={bank} onChange={setBank} />
          </div>
        </details>

        <div className="fsl-create-trip__actions">
          {submitError ? <InlineError error={submitError} /> : null}
          <Button
            type="submit"
            variant="primary"
            block
            disabled={!isFormValid || createMutation.isPending}
            loading={createMutation.isPending}
          >
            {t('create.submit')}
          </Button>
        </div>
      </form>
    </Screen>
  );
}
