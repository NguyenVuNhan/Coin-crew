import { useState, type JSX } from 'react';
import { useParams, Link, Navigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { BankInput } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { useTripView } from '../api/hooks';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { InlineError } from '../components/InlineError';
import { BankFields, type BankFieldsValue } from '../components/BankFields';
import { Skeleton } from '../components/Skeleton';
import './BankDetails.css';
import './GuestBank.css';

type Mode = 'show' | 'form' | 'saved' | 'deleted';

export function GuestBank(): JSX.Element | null {
  const { tripId, pid } = useParams<{ tripId: string; pid: string }>();
  const t = useT();
  const queryClient = useQueryClient();
  const { view, isLoading, error, refetch } = useTripView(tripId ?? '', 0);

  const [modeOverride, setModeOverride] = useState<Mode | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  const [value, setValue] = useState<BankFieldsValue>({
    bin: '',
    accountNumber: '',
    holderName: '',
  });
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const person = view?.people.find((p) => p.id === pid);
  const backLink = `/t/${tripId}/people`;

  if ((isLoading && !view) || (!view && !error)) {
    return (
      <Screen title={t('people.bank')} back={backLink}>
        <div className="fsl-bank-details">
          <div className="fsl-bank-details__loading">
            <Skeleton width="100%" height={16} radius="sm" />
            <Skeleton width="100%" height={44} radius="md" />
            <Skeleton width="100%" height={44} radius="md" />
            <Skeleton width="100%" height={44} radius="md" />
            <Skeleton width="100%" height={48} radius="md" />
          </div>
        </div>
      </Screen>
    );
  }

  if (error && !view) {
    return (
      <Screen title={t('people.bank')} back={backLink}>
        <div className="fsl-bank-details">
          <InlineError error={error} onRetry={refetch} />
        </div>
      </Screen>
    );
  }

  if (!view || view.me.kind !== 'member' || !person || person.isMember) {
    return <Navigate to={`/t/${tripId}`} replace />;
  }

  const isArchived = Boolean(view.trip.archived);
  const initialMode: Mode = person.bank === 'none' && !isArchived ? 'form' : 'show';
  const mode = modeOverride ?? initialMode;

  const handleDelete = async () => {
    if (!window.confirm(t('guestBank.deleteConfirm', { name: person.name }))) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiSend(`/api/trips/${tripId}/people/${pid}/bank`, 'DELETE', undefined, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      setModeOverride('deleted');
    } catch (err) {
      setDeleteError(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const isComplete =
    value.bin.trim() !== '' &&
    value.accountNumber.trim() !== '' &&
    value.holderName.trim() !== '' &&
    consent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const body: BankInput = {
      bin: value.bin.trim(),
      accountNumber: value.accountNumber.trim(),
      holderName: value.holderName.trim(),
      consent: true,
    };

    try {
      await apiSend(`/api/trips/${tripId}/people/${pid}/bank`, 'PUT', body, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      setModeOverride('saved');
    } catch (err) {
      setSubmitError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setModeOverride('show');
    setIsEditing(false);
    setValue({ bin: '', accountNumber: '', holderName: '' });
    setConsent(false);
    setSubmitError(null);
  };

  const [beforeLink = '', afterLink = ''] = t('guestBank.consent', { name: person.name }).split('{link}');

  return (
    <Screen
      title={t('guestBank.title', { name: person.name })}
      back={mode === 'saved' || mode === 'deleted' ? undefined : backLink}
      bottomBar={
        mode === 'form' ? (
          <>
            {submitError !== null ? <InlineError error={submitError} /> : null}
            <Button
              type="submit"
              form="guest-bank-form"
              variant="primary"
              block
              disabled={!isComplete || isSubmitting}
              loading={isSubmitting}
            >
              {t('bankForm.save')}
            </Button>
            {isEditing && (
              <Button
                type="button"
                variant="ghost"
                block
                onClick={handleCancel}
              >
                {t('common.cancel')}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div className={`fsl-bank-details${submitError !== null ? ' fsl-bank-details--bar-error' : ''}`}>
        {mode === 'show' && (
          <>
            {person.bankAccount ? (
              <div className="fsl-guest-bank__card">
                <p className="fsl-guest-bank__account">{`${person.bankAccount.bankName} · ${person.bankAccount.accountNumberMasked}`}</p>
                <p className="fsl-guest-bank__holder">{person.bankAccount.holderName}</p>
              </div>
            ) : null}
            {person.bank === 'pending' ? (
              <p className="fsl-guest-bank__pending">{t('guestBank.pending')}</p>
            ) : null}
            {isArchived ? (
              <p className="fsl-guest-bank__archived">{t('settings.archived')}</p>
            ) : (
              <>
                <div className="fsl-guest-bank__buttons">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setModeOverride('form');
                      setIsEditing(true);
                    }}
                  >
                    {t('guestBank.change')}
                  </Button>
                  <Button variant="danger" loading={isDeleting} onClick={handleDelete}>
                    {t('guestBank.delete')}
                  </Button>
                </div>
                {deleteError !== null ? <InlineError error={deleteError} /> : null}
              </>
            )}
          </>
        )}
        {mode === 'form' && (
          <form id="guest-bank-form" className="fsl-bank-details__form" onSubmit={handleSubmit}>
            <p className="fsl-bank-details__note">{t('guestBank.note', { name: person.name })}</p>
            <BankFields value={value} onChange={setValue} />
            <div className="fsl-bank-details__consent-row">
              <input
                id="fsl-bank-consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="fsl-bank-details__checkbox"
              />
              <label htmlFor="fsl-bank-consent" className="fsl-bank-details__consent-label">
                {beforeLink}<Link to="/privacy" className="fsl-bank-details__privacy-link">{t('bankForm.privacyLink')}</Link>{afterLink}
              </label>
            </div>
          </form>
        )}
        {mode === 'saved' && (
          <div className="fsl-bank-details__success">
            <div className="fsl-bank-details__notice fsl-bank-details__notice--accent" role="status">
              {t('bankForm.saved')}
            </div>
            <Link to={backLink} className="fsl-button fsl-button--secondary">
              {t('common.back')}
            </Link>
          </div>
        )}
        {mode === 'deleted' && (
          <div className="fsl-bank-details__success">
            <div className="fsl-bank-details__notice fsl-bank-details__notice--accent" role="status">
              {t('guestBank.deleted')}
            </div>
            <Link to={backLink} className="fsl-button fsl-button--secondary">
              {t('common.back')}
            </Link>
          </div>
        )}
      </div>
    </Screen>
  );
}
