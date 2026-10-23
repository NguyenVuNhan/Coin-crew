import { useState, useId } from 'react';
import { useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse, AuthProvider } from '@fsl/core';
import { useT } from '../i18n';
import { isZaloWebView } from '../lib/zaloEnv';
import { apiSend } from '../api/client';
import { signInHref } from './SignInButtons';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { InlineError } from './InlineError';
import './LinkedAccounts.css';

export interface LinkedAccountsProps {
  me: MeResponse;
}

export function LinkedAccounts({ me }: LinkedAccountsProps) {
  const t = useT();
  const location = useLocation();
  const returnTo = location.pathname;
  const queryClient = useQueryClient();
  const headingId = useId();

  const [confirming, setConfirming] = useState<AuthProvider | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const user = me.user;
  if (!user) {
    return null;
  }

  const inZalo = isZaloWebView();
  const providers = user.providers ?? [];
  const isGoogleLinked = providers.includes('google');
  const isZaloLinked = providers.includes('zalo');

  const googleStatus = isGoogleLinked
    ? (user.email || t('account.linked'))
    : t('account.notLinked');

  const zaloStatus = isZaloLinked
    ? t('account.linked')
    : t('account.notLinked');

  const startUnlink = (provider: AuthProvider) => {
    setError(null);
    setConfirming(provider);
  };

  const handleUnlink = async () => {
    if (!confirming) return;
    const provider = confirming;
    setUnlinking(true);
    setError(null);
    try {
      await apiSend(`/api/me/identities/${provider}`, 'DELETE');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setConfirming(null);
    } catch (err) {
      setConfirming(null);
      setError(err);
    } finally {
      setUnlinking(false);
    }
  };

  const handleCancelMerge = async (id: string) => {
    setCancellingId(id);
    setError(null);
    try {
      await apiSend(`/api/me/merge-requests/${id}/cancel`, 'POST');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(err);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="fsl-linked" aria-labelledby={headingId}>
      <h3 id={headingId} className="fsl-linked__title">
        {t('account.methods')}
      </h3>
      <ul className="fsl-linked__list">
        <li data-testid="method-google" className="fsl-linked__row">
          <div className="fsl-linked__info">
            <span className="fsl-linked__provider">Google</span>
            <span className="fsl-linked__status">{googleStatus}</span>
          </div>
          <div className="fsl-linked__actions">
            {isGoogleLinked ? (
              <>
                {!inZalo && (
                  <Button variant="ghost" href={signInHref('google', returnTo, 'link')}>
                    {t('account.change')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="fsl-linked__unlink"
                  disabled={providers.length < 2}
                  onClick={() => startUnlink('google')}
                >
                  {t('account.unlink')}
                </Button>
              </>
            ) : (
              !inZalo && (
                <Button variant="ghost" href={signInHref('google', returnTo, 'link')}>
                  {t('account.link')}
                </Button>
              )
            )}
          </div>
          {inZalo && (
            <p className="fsl-linked__hint">{t('signIn.googleInZalo')}</p>
          )}
        </li>

        <li data-testid="method-zalo" className="fsl-linked__row">
          <div className="fsl-linked__info">
            <span className="fsl-linked__provider">Zalo</span>
            <span className="fsl-linked__status">{zaloStatus}</span>
          </div>
          <div className="fsl-linked__actions">
            {isZaloLinked ? (
              <>
                <Button variant="ghost" href={signInHref('zalo', returnTo, 'link')}>
                  {t('account.change')}
                </Button>
                <Button
                  variant="ghost"
                  className="fsl-linked__unlink"
                  disabled={providers.length < 2}
                  onClick={() => startUnlink('zalo')}
                >
                  {t('account.unlink')}
                </Button>
              </>
            ) : (
              me.signIn.zalo === true && (
                <Button variant="ghost" href={signInHref('zalo', returnTo, 'link')}>
                  {t('account.link')}
                </Button>
              )
            )}
          </div>
        </li>
      </ul>

      {error !== null && (
        <InlineError error={error} className="fsl-linked__error" />
      )}

      {providers.length === 1 && (
        <>
          <p className="fsl-linked__note">{t('account.unlinkLast')}</p>
          <p className="fsl-linked__nudge">
            {providers[0] === 'zalo'
              ? t('account.backupNudgeZalo')
              : t('account.backupNudgeGoogle')}
          </p>
        </>
      )}

      {me.mergeRequests?.outgoing?.map((req) => (
        <div
          key={req.id}
          className={`fsl-linked__merge fsl-linked__merge--${req.status}`}
        >
          <span className="fsl-linked__merge-text">
            {req.status === 'pending'
              ? t('merge.outgoingPending')
              : req.status === 'accepted'
                ? t('merge.outgoingAccepted')
                : t('merge.outgoingDeclined')}
          </span>
          {req.status === 'pending' && (
            <Button
              variant="secondary"
              loading={cancellingId === req.id}
              onClick={() => handleCancelMerge(req.id)}
            >
              {t('merge.cancel')}
            </Button>
          )}
        </div>
      ))}

      <Sheet
        open={confirming !== null}
        title={
          confirming
            ? t('account.unlinkConfirm', {
                provider: confirming === 'google' ? 'Google' : 'Zalo',
              })
            : ''
        }
        onClose={() => {
          if (!unlinking) {
            setConfirming(null);
          }
        }}
        className="fsl-linked__sheet"
      >
        <div className="fsl-linked__sheet-actions">
          <Button
            variant="danger"
            block
            loading={unlinking}
            onClick={handleUnlink}
          >
            {t('account.unlink')}
          </Button>
          <Button
            variant="secondary"
            block
            disabled={unlinking}
            onClick={() => setConfirming(null)}
          >
            {t('merge.cancel')}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
