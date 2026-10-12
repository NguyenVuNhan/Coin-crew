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
  const successNoticeText = isGuest ? t('bankForm.pending') : t('bankForm.saved');

  return (
    <Screen title={t('bankForm.title')} back={backLink}>
      <div className="fsl-bank-details">
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
          <form onSubmit={handleSubmit}>
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
                {t('consent.agree')}
              </label>
              <span aria-hidden="true">·</span>
              <Link to="/privacy" className="fsl-bank-details__privacy-link">
                {t('consent.readNotice')}
              </Link>
            </div>

            <div className="fsl-bank-details__actions">
              {submitError !== null && <InlineError error={submitError} />}

              <Button
                type="submit"
                variant="primary"
                block
                disabled={!isComplete || isSubmitting}
                loading={isSubmitting}
              >
                {t('bankForm.save')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Screen>
  );
}
