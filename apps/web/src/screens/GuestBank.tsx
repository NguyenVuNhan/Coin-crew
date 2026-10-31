import { useState, type JSX } from 'react';
import { useParams, Link, Navigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { BankInput } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { useTripView } from '../api/hooks';
import { useTrip } from '../lib/tripBase';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { InlineError } from '../components/InlineError';
import { BankFields, type BankFieldsValue } from '../components/BankFields';
import { Skeleton } from '../components/Skeleton';
import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Mode = 'show' | 'form' | 'saved' | 'deleted';

export function GuestBank(): JSX.Element | null {
  const { tripId, href } = useTrip();
  const { pid } = useParams<{ pid: string }>();
  const t = useT();
  const queryClient = useQueryClient();
  const { view, isLoading, error, refetch } = useTripView(tripId, 0);

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
  const backLink = href('/people');

  if ((isLoading && !view) || (!view && !error)) {
    return (
      <Screen title={t('people.bank')} back={backLink}>
        <div className="fsl-bank-details flex flex-col gap-4 max-w-[480px] mx-auto w-full">
          <div className="fsl-bank-details__loading flex flex-col gap-4">
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
        <div className="fsl-bank-details flex flex-col gap-4 max-w-[480px] mx-auto w-full">
          <InlineError error={error} onRetry={refetch} />
        </div>
      </Screen>
    );
  }

  if (!view || view.me.kind !== 'member' || !person || person.isMember) {
    return <Navigate to={href()} replace />;
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
      <div
        className={cn(
          'fsl-bank-details flex flex-col gap-4 max-w-[480px] mx-auto w-full',
          submitError !== null && 'fsl-bank-details--bar-error max-lg:pb-24',
        )}
      >
        {mode === 'show' && (
          <>
            {person.bankAccount ? (
              <div className="fsl-guest-bank__card p-4 rounded-xl border border-border bg-card flex flex-col gap-1">
                <p className="fsl-guest-bank__account m-0 text-base font-semibold text-foreground tabular-nums">{`${person.bankAccount.bankName} · ${person.bankAccount.accountNumberMasked}`}</p>
                <p className="fsl-guest-bank__holder m-0 text-sm text-muted-foreground">{person.bankAccount.holderName}</p>
              </div>
            ) : null}
            {person.bank === 'pending' ? (
              <p className="fsl-guest-bank__pending m-0 text-sm text-warning-foreground bg-warning-soft px-3 py-2 rounded-lg">{t('guestBank.pending')}</p>
            ) : null}
            {isArchived ? (
              <p className="fsl-guest-bank__archived m-0 text-sm text-muted-foreground">{t('settings.archived')}</p>
            ) : (
              <>
                <div className="fsl-guest-bank__buttons flex gap-3 [&>*]:flex-1">
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
          <form id="guest-bank-form" className="fsl-bank-details__form flex flex-col gap-4" onSubmit={handleSubmit}>
            <p className="fsl-bank-details__note m-0 text-sm text-muted-foreground">{t('guestBank.note', { name: person.name })}</p>
            <BankFields value={value} onChange={setValue} />
            <div className="fsl-bank-details__consent-row flex items-center gap-2 min-h-11 text-sm text-foreground select-none">
              <Checkbox
                id="fsl-bank-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="fsl-bank-details__checkbox"
              />
              <Label htmlFor="fsl-bank-consent" className="fsl-bank-details__consent-label flex-1 block font-normal leading-snug py-3 cursor-pointer">
                {beforeLink}<Link to="/privacy" className="fsl-bank-details__privacy-link text-primary underline underline-offset-[3px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs">{t('bankForm.privacyLink')}</Link>{afterLink}
              </Label>
            </div>
          </form>
        )}
        {mode === 'saved' && (
          <div className="fsl-bank-details__success flex flex-col gap-4 items-center text-center">
            <div className="fsl-bank-details__notice fsl-bank-details__notice--accent px-4 py-3 rounded-xl text-sm text-center bg-secondary text-secondary-foreground" role="status">
              {t('bankForm.saved')}
            </div>
            <Link
              to={backLink}
              className={cn('fsl-button fsl-button--secondary', buttonVariants({ variant: 'secondary' }))}
            >
              {t('common.back')}
            </Link>
          </div>
        )}
        {mode === 'deleted' && (
          <div className="fsl-bank-details__success flex flex-col gap-4 items-center text-center">
            <div className="fsl-bank-details__notice fsl-bank-details__notice--accent px-4 py-3 rounded-xl text-sm text-center bg-secondary text-secondary-foreground" role="status">
              {t('guestBank.deleted')}
            </div>
            <Link
              to={backLink}
              className={cn('fsl-button fsl-button--secondary', buttonVariants({ variant: 'secondary' }))}
            >
              {t('common.back')}
            </Link>
          </div>
        )}
      </div>
    </Screen>
  );
}
