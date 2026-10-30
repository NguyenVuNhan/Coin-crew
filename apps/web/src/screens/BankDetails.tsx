import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BankInput, MyBankResponse } from '@fsl/core';
import { useT } from '../i18n';
import { apiFetch, apiSend } from '../api/client';
import { useTripView } from '../api/hooks';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { InlineError } from '../components/InlineError';
import { BankFields, type BankFieldsValue } from '../components/BankFields';
import { Skeleton } from '../components/Skeleton';
import { MyBankRow } from '../components/MyBankRow';
import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function BankDetails() {
  const { tripId } = useParams<{ tripId?: string }>();
  const t = useT();
  const queryClient = useQueryClient();

  const tripViewResult = useTripView(tripId ?? '', 0);
  const view = tripId ? tripViewResult.view : undefined;
  const isLoading = tripId ? tripViewResult.isLoading : false;
  const tripError = tripId ? tripViewResult.error : null;

  const isMemberForm = !tripId || view?.me.kind === 'member';

  const myBankQuery = useQuery<MyBankResponse | null>({
    queryKey: ['me', 'bank'],
    queryFn: () => apiFetch<MyBankResponse | null>('/api/me/bank'),
    enabled: isMemberForm,
  });

  const [value, setValue] = useState<BankFieldsValue>({
    bin: '',
    accountNumber: '',
    holderName: '',
  });
  const userTypedRef = useRef(false);
  const prefilledRef = useRef(false);

  useEffect(() => {
    if (prefilledRef.current || userTypedRef.current) return;
    if (myBankQuery.data) {
      prefilledRef.current = true;
      setValue({
        bin: myBankQuery.data.bin,
        accountNumber: myBankQuery.data.accountNumber,
        holderName: myBankQuery.data.holderName,
      });
    }
  }, [myBankQuery.data]);

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
      await queryClient.invalidateQueries({ queryKey: ['me', 'bank'] });
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
        <div className={cn('fsl-bank-details flex flex-col gap-4 w-full max-w-[480px] mx-auto')}>
          <div className={cn('fsl-bank-details__loading flex flex-col gap-4')}>
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
        <div className={cn('fsl-bank-details flex flex-col gap-4 w-full max-w-[480px] mx-auto')}>
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
        <div className={cn('fsl-bank-details flex flex-col gap-4 w-full max-w-[480px] mx-auto')}>
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
        className={cn(
          'fsl-bank-details flex flex-col gap-4 w-full max-w-[480px] mx-auto',
          submitError !== null && 'fsl-bank-details--bar-error max-lg:pb-24',
        )}
      >
        {success ? (
          <div className={cn('fsl-bank-details__success flex flex-col items-center gap-4 text-center')}>
            <div className={cn('fsl-bank-details__notice fsl-bank-details__notice--accent px-4 py-3 rounded-xl text-sm text-center bg-secondary text-secondary-foreground')} role="status">
              {successNoticeText}
            </div>
            <Link
              to={backLink}
              className={cn('fsl-button fsl-button--secondary', buttonVariants({ variant: 'secondary' }))}
            >
              {t('common.back')}
            </Link>
          </div>
        ) : (
          <form id="bank-details-form" className={cn('fsl-bank-details__form flex flex-col gap-4')} onSubmit={handleSubmit}>
            <p className={cn('fsl-bank-details__note m-0 text-sm leading-snug text-muted-foreground')}>{note}</p>

            <BankFields
              value={value}
              onChange={(v) => {
                userTypedRef.current = true;
                setValue(v);
              }}
            />

            <div className={cn('fsl-bank-details__consent-row flex items-center gap-2 min-h-11 text-sm leading-snug text-foreground select-none')}>
              <Checkbox
                id="fsl-bank-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="fsl-bank-details__checkbox"
              />
              <Label htmlFor="fsl-bank-consent" className={cn('fsl-bank-details__consent-label flex-1 block font-normal leading-snug py-3 cursor-pointer')}>
                {beforeLink}
                <Link
                  to="/privacy"
                  className={cn(
                    'fsl-bank-details__privacy-link font-medium underline underline-offset-[3px] text-primary hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs',
                  )}
                >
                  {t('bankForm.privacyLink')}
                </Link>
                {afterLink}
              </Label>
            </div>
          </form>
        )}
      </div>
    </Screen>
  );
}
