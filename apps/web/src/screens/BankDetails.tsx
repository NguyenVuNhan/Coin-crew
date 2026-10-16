import { useState } from 'react';
import { useParams, Link } from 'react-router';
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
import { MyBankRow } from '../components/MyBankRow';
import './BankDetails.css';

export function BankDetails() {
  const { tripId } = useParams<{ tripId?: string }>();
  const t = useT();
  const queryClient = useQueryClient();

  const tripViewResult = useTripView(tripId ?? '', 0);
  const view = tripId ? tripViewResult.view : undefined;
  const isLoading = tripId ? tripViewResult.isLoading : false;
  const tripError = tripId ? tripViewResult.error : null;

  const [value, setValue] = useState<BankFieldsValue>({
    bin: '',
    accountNumber: '',
    holderName: '',
  });
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);

  const backLink = tripId ? `/t/${tripId}` : '/trips';

  const note = tripId
    ? view?.me.kind === 'guest'
      ? t('bankForm.guestNote')
      : t('bankForm.memberNote')
    : t('bankForm.memberNote');

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
      if (tripId) {
        await apiSend(`/api/trips/${tripId}/bank`, 'PUT', body, tripId);
        await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      } else {
        await apiSend('/api/me/bank', 'PUT', body);
      }
      setSuccess(true);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (tripId && isLoading && !view) {
    return (
      <Screen title={t('bankForm.title')} back={backLink}>
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

  if (tripId && tripError && !view) {
    return (
      <Screen title={t('bankForm.title')} back={backLink}>
        <div className="fsl-bank-details">
          <InlineError error={tripError} onRetry={tripViewResult.refetch} />
        </div>
      </Screen>
    );
  }

  const isGuest = tripId && view?.me.kind === 'guest';

  // A guest whose details are approved (only a member changes them), or whose name still waits, gets no form.
  const myPerson = view?.people.find((p) => p.id === view.me.participantId);
  if (isGuest && view && !success && (view.me.participantPending || myPerson?.bank === 'approved')) {
    return (
      <Screen title={t('bankForm.title')} back={backLink}>
        <div className="fsl-bank-details">
          <MyBankRow view={view} />
        </div>
      </Screen>
    );
  }
  const successNoticeText = isGuest ? t('bankForm.pending') : t('bankForm.saved');
  const [beforeLink = '', afterLink = ''] = t('bankForm.consentLabel').split('{link}');

  return (
    <Screen
      title={t('bankForm.title')}
      back={backLink}
      bottomBar={
        success ? undefined : (
          <>
            {submitError !== null ? <InlineError error={submitError} /> : null}
            <Button
              type="submit"
              form="bank-details-form"
              variant="primary"
              block
              disabled={!isComplete || isSubmitting}
              loading={isSubmitting}
            >
              {t('bankForm.save')}
            </Button>
          </>
        )
      }
    >
      <div
        className={`fsl-bank-details${submitError !== null ? ' fsl-bank-details--bar-error' : ''}`}
      >
        {success ? (
          <div className="fsl-bank-details__success">
            <div className="fsl-bank-details__notice fsl-bank-details__notice--accent" role="status">
              {successNoticeText}
            </div>
            <Link to={backLink} className="fsl-button fsl-button--secondary">
              {t('common.back')}
            </Link>
          </div>
        ) : (
          <form id="bank-details-form" className="fsl-bank-details__form" onSubmit={handleSubmit}>
            <p className="fsl-bank-details__note">{note}</p>

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
      </div>
    </Screen>
  );
}
