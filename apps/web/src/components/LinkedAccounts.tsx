import { useState, useId } from 'react';
import { useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse, AuthProvider, OutgoingMergeRequest } from '@fsl/core';
import { useT } from '../i18n';
import { isZaloWebView } from '../lib/zaloEnv';
import { apiSend } from '../api/client';
import { signInHref } from './SignInButtons';
import { ProviderLogo, providerName } from './ProviderLogo';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { InlineError } from './InlineError';
import { Pill, type PillProps } from './Pill';
import { Icon, type IconName } from './icons';
import { MergeSheet } from './MergeSheet';
import { cn } from '@/lib/utils';

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
  const [error, setError] = useState<unknown>(null);
  const [whyLinkOpen, setWhyLinkOpen] = useState<AuthProvider | null>(null);
  const [selectedMergeRequest, setSelectedMergeRequest] = useState<OutgoingMergeRequest | null>(null);

  const user = me.user;
  if (!user) {
    return null;
  }

  const inZalo = isZaloWebView();
  const userProviders = user.providers ?? [];
  const isGoogleLinked = userProviders.includes('google');
  const isZaloLinked = userProviders.includes('zalo');
  const zaloOn = me.signIn.zalo === true;

  // Zalo not configured (me.signIn.zalo !== true) and Zalo not linked: no Zalo card.
  const hasZaloMerge = me.mergeRequests?.outgoing?.some((r) => r.provider === 'zalo');
  const showZalo = isZaloLinked || zaloOn || Boolean(hasZaloMerge);
  const providerList: AuthProvider[] = ['google', ...(showZalo ? (['zalo'] as const) : [])];

  const liveMergeRequest = selectedMergeRequest
    ? (me.mergeRequests?.outgoing?.find((r) => r.id === selectedMergeRequest.id) ?? selectedMergeRequest)
    : null;

  const startUnlink = (provider: AuthProvider) => {
    setError(null);
    setConfirming(provider);
  };

  const handleUnlink = async () => {
    if (!confirming || unlinking) return;
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

  return (
    <section className="fsl-linked flex flex-col" aria-labelledby={headingId}>
      <h3 id={headingId} className="fsl-linked__title text-xs font-semibold text-muted-foreground m-0">
        {t('account.methods')}
      </h3>
      <p className="fsl-linked__hint-text text-xs text-subtle-foreground mt-0.5 mb-2">
        {t('account.methodsHint')}
      </p>

      <ul className="fsl-linked__list m-0 p-0 list-none flex flex-col bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
        {providerList.map((p) => {
          const isLinked = userProviders.includes(p);
          const mergeRequest = me.mergeRequests?.outgoing?.find((r) => r.provider === p);
          const pName = providerName(p);
          const testId = `method-${p}`;

          if (mergeRequest) {
            let pillTone: PillProps['tone'] = 'warning';
            let pillIcon: IconName = 'clock';
            let chipText = t('merge.chipPending');
            let mergeLogoMuted = true;

            if (mergeRequest.status === 'accepted') {
              pillTone = 'success';
              pillIcon = 'check';
              chipText = t('merge.chipAccepted');
              mergeLogoMuted = false;
            } else if (mergeRequest.status === 'declined') {
              pillTone = 'danger';
              pillIcon = 'x';
              chipText = t('merge.chipDeclined');
              mergeLogoMuted = true;
            } else {
              pillTone = 'warning';
              pillIcon = 'clock';
              chipText = t('merge.chipPending');
              mergeLogoMuted = true;
            }

            const otherName = mergeRequest.otherName ?? pName;
            const rowLabel = t('merge.rowLabel', {
              provider: pName,
              status: chipText,
              name: otherName,
            });

            return (
              <li
                key={p}
                data-testid={testId}
                className="fsl-linked__card fsl-linked__card--chip p-0"
              >
                <button
                  type="button"
                  className="fsl-linked__chip-btn flex items-center gap-3 w-full min-h-12 px-4 py-3 bg-transparent hover:bg-muted text-left cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSelectedMergeRequest(mergeRequest)}
                  aria-label={rowLabel}
                >
                  <ProviderLogo provider={p} size={32} muted={mergeLogoMuted} className="rounded-md border border-border shrink-0" />
                  <span className="fsl-linked__info flex flex-col min-w-0 flex-1 gap-0.5">
                    <span className="fsl-linked__header-row flex items-center gap-2 flex-wrap min-w-0">
                      <span className="fsl-linked__provider text-sm font-semibold text-foreground">{pName}</span>
                      <span className="fsl-linked__status inline-flex items-center">
                        <Pill tone={pillTone}>
                          <Icon name={pillIcon} size={12} />
                          <span>{chipText}</span>
                        </Pill>
                      </span>
                    </span>
                    {otherName ? (
                      <span className="fsl-linked__identity text-xs text-muted-foreground truncate min-w-0" title={otherName}>
                        {otherName}
                      </span>
                    ) : null}
                  </span>
                  <span className="fsl-linked__chevron flex items-center justify-center text-muted-foreground shrink-0" aria-hidden="true">
                    <Icon name="chevronRight" size={18} />
                  </span>
                </button>
              </li>
            );
          }

          const isGoogleInZalo = inZalo && p === 'google';
          let identityText: string | null = null;
          if (isGoogleInZalo) {
            identityText = t('signIn.googleInZalo');
          } else if (p === 'google') {
            identityText = user.email ?? null;
          } else if (p === 'zalo') {
            identityText = user.zaloName ?? null;
          }

          const hasIdentity = Boolean(identityText && identityText.trim().length > 0);
          const showWhyLink = userProviders.length === 1 && !isLinked;
          const isWhyOpen = whyLinkOpen === p;

          return (
            <li key={p} data-testid={testId} className="fsl-linked__card flex items-center gap-3 px-4 py-3 min-h-12">
              <ProviderLogo provider={p} size={32} muted={!isLinked} className="rounded-md border border-border shrink-0" />
              <div className="fsl-linked__info flex flex-col min-w-0 flex-1 gap-0.5">
                <div className="fsl-linked__header-row flex items-center gap-2 flex-wrap min-w-0">
                  <span className="fsl-linked__provider text-sm font-semibold text-foreground">{pName}</span>
                  <div
                    className={cn(
                      'fsl-linked__status inline-flex items-center gap-1.5',
                      isLinked ? 'fsl-linked__status--linked' : 'fsl-linked__status--unlinked',
                    )}
                  >
                    <Pill tone={isLinked ? 'success' : 'neutral'}>
                      {isLinked ? (
                        <>
                          <Icon name="circleCheck" size={12} />
                          <span>{t('account.linked')}</span>
                        </>
                      ) : (
                        <span>{t('account.notLinked')}</span>
                      )}
                    </Pill>
                    {showWhyLink && (
                      <button
                        type="button"
                        className="fsl-linked__why-btn inline-flex items-center justify-center size-6 text-muted-foreground hover:text-foreground rounded-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-expanded={isWhyOpen}
                        aria-label={t('account.whyLink')}
                        onClick={() => setWhyLinkOpen(isWhyOpen ? null : p)}
                      >
                        <Icon name="info" size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {hasIdentity && (
                  <span
                    className={cn(
                      'fsl-linked__identity text-xs text-muted-foreground truncate min-w-0',
                      isGoogleInZalo && 'fsl-linked__identity--multiline whitespace-normal line-clamp-2',
                    )}
                    title={identityText!}
                  >
                    {identityText}
                  </span>
                )}
                {isWhyOpen && (
                  <p className="fsl-linked__why-text text-xs text-muted-foreground m-0 mt-1">
                    {p === 'google'
                      ? t('account.backupNudgeZalo')
                      : t('account.backupNudgeGoogle')}
                  </p>
                )}
              </div>
              <div className="fsl-linked__actions flex items-center justify-end gap-2 shrink-0 empty:hidden">
                {isLinked ? (
                  <>
                    {!isGoogleInZalo && (
                      <Button
                        variant="secondary"
                        className="fsl-linked__icon-btn size-9 min-w-9 min-h-9 p-0 rounded-full"
                        href={signInHref(p, returnTo, 'link')}
                        aria-label={t('account.change')}
                        title={t('account.change')}
                      >
                        <Icon name="swap" size={16} />
                      </Button>
                    )}
                    {userProviders.length > 1 && (
                      <Button
                        variant="danger"
                        className="fsl-linked__icon-btn fsl-linked__icon-btn--unlink size-9 min-w-9 min-h-9 p-0 rounded-full text-danger border-border hover:bg-danger-soft hover:text-danger"
                        onClick={() => startUnlink(p)}
                        aria-label={t('account.unlink')}
                        title={t('account.unlink')}
                      >
                        <Icon name="trash" size={16} />
                      </Button>
                    )}
                  </>
                ) : (
                  !isGoogleInZalo && (
                    <Button
                      variant="primary"
                      className="fsl-linked__icon-btn size-9 min-w-9 min-h-9 p-0 rounded-full"
                      href={signInHref(p, returnTo, 'link')}
                      aria-label={t('account.link')}
                      title={t('account.link')}
                    >
                      <Icon name="link" size={16} />
                    </Button>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error !== null && (
        <InlineError error={error} className="fsl-linked__error mt-2" />
      )}

      {liveMergeRequest && (
        <MergeSheet
          request={liveMergeRequest}
          open={selectedMergeRequest !== null}
          onClose={() => setSelectedMergeRequest(null)}
        />
      )}

      <Sheet
        open={confirming !== null}
        title={
          confirming
            ? t('account.unlinkConfirm', {
                provider: providerName(confirming),
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
        <div className="fsl-linked__sheet-actions flex flex-col gap-2 pt-2">
          <Button
            variant="danger"
            block
            loading={unlinking}
            onClick={handleUnlink}
            className="rounded-full"
          >
            {t('account.unlink')}
          </Button>
          <Button
            variant="secondary"
            block
            disabled={unlinking}
            onClick={() => setConfirming(null)}
            className="rounded-full"
          >
            {t('merge.cancel')}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
