import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { OutgoingMergeRequest } from '@fsl/core';
import { useT } from '../i18n';
import { isZaloWebView } from '../lib/zaloEnv';
import { formatExpiry } from '../lib/time';
import { apiSend, ApiClientError } from '../api/client';
import { providerName } from './ProviderLogo';
import { signInHref } from './SignInButtons';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { InlineError } from './InlineError';
import { Icon } from './icons';
import './MergeSheet.css';

export interface MergeSheetProps {
  request: OutgoingMergeRequest;
  open: boolean;
  onClose: () => void;
}

interface StepItem {
  status: 'done' | 'current' | 'failed' | 'future';
  isCurrent?: boolean;
  muted?: boolean;
  title: string;
  help?: string;
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof ApiClientError && err.code === 'NOT_FOUND') {
    return true;
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'NOT_FOUND'
  ) {
    return true;
  }
  return false;
}

export function MergeSheet({ request, open, onClose }: MergeSheetProps) {
  const t = useT();
  const location = useLocation();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [busy, setBusy] = useState<'cancel' | 'dismiss' | null>(null);
  const [error, setError] = useState<unknown>(null);

  const provider = request.provider;
  const pName = providerName(provider);
  const otherName = request.otherName ?? pName;
  const identityLabel = request.identityLabel ?? pName;

  const inZalo = isZaloWebView();
  const isGoogleInZalo = inZalo && provider === 'google';

  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(null);
      return;
    }
    setError(null);
    setBusy(null);
    const timer = setTimeout(() => {
      const focusPrimary = () => {
        containerRef.current?.querySelector<HTMLElement>('[data-primary]')?.focus();
      };
      focusPrimary();
      setTimeout(focusPrimary, 0);
    }, 0);
    return () => clearTimeout(timer);
  }, [open, request.id]);

  const handleSheetClose = () => {
    if (busy !== null) return;
    onClose();
  };

  const handleCancel = async () => {
    if (busy !== null) return;
    setBusy('cancel');
    setError(null);
    try {
      await apiSend(`/api/me/merge-requests/${request.id}/cancel`, 'POST');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    } catch (err) {
      if (isNotFoundError(err)) {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        onClose();
      } else {
        setError(err);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = async () => {
    if (busy !== null) return;
    setBusy('dismiss');
    setError(null);
    try {
      await apiSend(`/api/me/merge-requests/${request.id}/dismiss`, 'POST');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    } catch (err) {
      if (isNotFoundError(err)) {
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        onClose();
      } else {
        setError(err);
      }
    } finally {
      setBusy(null);
    }
  };

  const steps: StepItem[] = [
    {
      status: 'done',
      title: t('merge.step1', { provider: pName, label: identityLabel }),
    },
    {
      status:
        request.status === 'pending'
          ? 'current'
          : request.status === 'accepted'
            ? 'done'
            : 'failed',
      isCurrent: request.status === 'pending',
      title:
        request.status === 'pending'
          ? t('merge.step2Pending', { name: otherName })
          : request.status === 'accepted'
            ? t('merge.step2Accepted', { name: otherName })
            : t('merge.step2Declined', { name: otherName }),
      help:
        request.status === 'pending'
          ? t('merge.step2Help', {
              provider: pName,
              date: formatExpiry(request.expiresAt),
            })
          : undefined,
    },
    {
      status: request.status === 'accepted' ? 'done' : 'future',
      muted: request.status === 'declined',
      title: t('merge.step3'),
    },
  ];

  return (
    <Sheet
      open={open}
      onClose={handleSheetClose}
      dismissible={busy === null}
      title={t('merge.sheetTitle', { name: otherName })}
    >
      <div ref={containerRef} className="fsl-merge-sheet">
        {request.status !== 'accepted' && (
          <p className="fsl-merge-sheet__intro">
            {t('merge.sheetIntro', { provider: pName, name: otherName })}
          </p>
        )}

        <ol className="fsl-merge-steps">
          {steps.map((step, idx) => (
            <li
              key={idx}
              className={`fsl-merge-steps__item${step.muted ? ' fsl-merge-steps__item--muted' : ''}`}
              aria-current={step.isCurrent ? 'step' : undefined}
            >
              <span
                className={`fsl-merge-steps__marker fsl-merge-steps__marker--${step.status}`}
                aria-hidden="true"
              >
                {step.status === 'done' && <Icon name="check" size={14} />}
                {step.status === 'current' && <span className="fsl-merge-steps__dot" />}
                {step.status === 'failed' && <Icon name="x" size={14} />}
              </span>
              <div className="fsl-merge-steps__content">
                <p className="fsl-merge-steps__title">{step.title}</p>
                {step.help && <p className="fsl-merge-steps__help">{step.help}</p>}
              </div>
            </li>
          ))}
        </ol>

        {request.status === 'declined' && (
          <p className="fsl-merge-sheet__status-help">
            {t('merge.declinedHelp', { provider: pName, name: otherName })}
          </p>
        )}

        {request.status === 'accepted' && (
          <p className="fsl-merge-sheet__status-help">
            {t('merge.acceptedSummary', { name: otherName })}
          </p>
        )}

        {error !== null && (
          <InlineError error={error} className="fsl-merge-sheet__error" />
        )}

        <div className="fsl-merge-sheet__actions">
          {request.status === 'pending' && (
            <>
              {!isGoogleInZalo ? (
                <>
                  <Button
                    variant="primary"
                    block
                    data-primary=""
                    href={signInHref(provider, '/trips?mergeReview=' + request.id)}
                    disabled={busy !== null}
                    aria-disabled={busy !== null ? 'true' : undefined}
                    tabIndex={busy !== null ? -1 : undefined}
                  >
                    {t('merge.confirmHere', { provider: pName })}
                  </Button>
                  <p className="fsl-merge-sheet__switch-note">
                    {t('merge.switchNote', { name: otherName })}
                  </p>
                </>
              ) : (
                <p className="fsl-merge-sheet__hint">{t('signIn.googleInZalo')}</p>
              )}
              <Button
                variant="ghost"
                block
                data-primary={isGoogleInZalo ? '' : undefined}
                loading={busy === 'cancel'}
                disabled={busy !== null}
                onClick={handleCancel}
              >
                {t('merge.cancelRequest')}
              </Button>
            </>
          )}

          {request.status === 'declined' && (
            <>
              <Button
                variant="primary"
                block
                data-primary=""
                href={signInHref(provider, location.pathname, 'link')}
                disabled={busy !== null}
                aria-disabled={busy !== null ? 'true' : undefined}
                tabIndex={busy !== null ? -1 : undefined}
              >
                {t('merge.linkAgain')}
              </Button>
              <Button
                variant="ghost"
                block
                loading={busy === 'dismiss'}
                disabled={busy !== null}
                onClick={handleDismiss}
              >
                {t('merge.gotIt')}
              </Button>
            </>
          )}

          {request.status === 'accepted' && (
            <Button
              variant="primary"
              block
              data-primary=""
              loading={busy === 'dismiss'}
              disabled={busy !== null}
              onClick={handleDismiss}
            >
              {t('merge.gotIt')}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
