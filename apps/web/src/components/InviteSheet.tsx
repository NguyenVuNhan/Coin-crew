import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TripView } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT, useLang } from '../i18n';
import { apiSend } from '../api/client';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Icon } from './icons';
import { InlineError } from './InlineError';

function useLinkActions(view: TripView, url: string) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the URL stays selectable in the input.
    }
  }

  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: view.trip.name,
          text: t('invite.shareText', { trip: view.trip.name }),
          url,
        });
        return;
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError') {
          return;
        }
      }
    }
    await copy();
  }

  return { copied, copy, share };
}

function LinkBlock({
  view,
  which,
  token,
  title,
  hint,
  primary,
}: {
  view: TripView;
  which: 'group' | 'view';
  token: string;
  title: string;
  hint: string;
  primary?: boolean;
}) {
  const t = useT();
  const [lang] = useLang();
  const queryClient = useQueryClient();
  const legendId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const url = `${location.origin}/j/${token}?lang=${lang}`;
  const { copied, copy, share } = useLinkActions(view, url);

  async function regenerate() {
    if (!window.confirm(t('share.regenerateConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/trips/${view.trip.id}/links/regenerate`, 'POST', { which }, view.trip.id);
      await queryClient.invalidateQueries({ queryKey: ['trip', view.trip.id] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className={cn('fsl-invite__block m-0 p-0 border-0 min-w-0')}>
      <legend id={legendId} className={cn('fsl-invite__label w-full p-0 mb-2 text-base font-semibold text-foreground')}>
        {title}
      </legend>
      <div className={cn('fsl-invite__body flex flex-col gap-3 bg-muted rounded-xl p-4')}>
        <p className={cn('fsl-invite__hint m-0 text-sm text-muted-foreground')}>{hint}</p>
        <input
          className={cn('fsl-invite__input box-border w-full min-w-0 min-h-11 px-3 bg-card border border-border rounded-lg text-base text-foreground truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
          aria-labelledby={legendId}
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
        />
        <div className={cn('fsl-invite__buttons flex flex-col sm:flex-row gap-2')}>
          <Button variant={primary ? 'primary' : 'secondary'} block className="sm:flex-1" onClick={share}>
            <Icon name="share" size={18} />
            {t('invite.share')}
          </Button>
          <Button variant="secondary" block className="sm:flex-1" onClick={copy}>
            <Icon name="copy" size={18} />
            {copied ? t('share.copied') : t('share.copy')}
          </Button>
        </div>
        <span aria-live="polite" className={cn('fsl-invite__sr sr-only')}>{copied ? t('share.copied') : ''}</span>
        <Button variant="ghost" className={cn('fsl-invite__regenerate self-start -ml-2 px-2 text-muted-foreground text-sm hover:text-foreground')} loading={busy} onClick={regenerate}>
          {t('share.regenerate')}
        </Button>
        {error ? <InlineError error={error} /> : null}
      </div>
    </fieldset>
  );
}

/** Invite bottom sheet holding group and view-only links, share, copy, and regenerate. */
export function InviteSheet({
  view,
  open,
  onClose,
}: {
  view: TripView;
  open: boolean;
  onClose(): void;
}) {
  const t = useT();

  if (!view.links) return null;

  return (
    <Sheet open={open} onClose={onClose} title={t('invite.title')}>
      <div className={cn('fsl-invite flex flex-col gap-4')}>
        <LinkBlock
          view={view}
          which="group"
          token={view.links.group}
          title={t('share.groupLink')}
          hint={t('share.groupHint')}
          primary
        />
        <LinkBlock
          view={view}
          which="view"
          token={view.links.view}
          title={t('share.viewLink')}
          hint={t('share.viewHint')}
        />
      </div>
    </Sheet>
  );
}

/** Invite card shown at the top of a brand-new trip with the group link, share, and copy. */
export function InviteCard({ view }: { view: TripView }) {
  const t = useT();
  const [lang] = useLang();
  const titleId = useId();
  const url = view.links ? `${location.origin}/j/${view.links.group}?lang=${lang}` : '';
  const { copied, copy, share } = useLinkActions(view, url);

  if (!view.links) return null;

  return (
    <section className={cn('fsl-invite-card bg-card rounded-xl p-5 border border-border flex flex-col gap-3')} aria-labelledby={titleId}>
      <h2 id={titleId} className={cn('fsl-invite-card__title m-0 text-base font-semibold text-foreground')}>{t('invite.cardTitle')}</h2>
      <p className={cn('fsl-invite-card__body m-0 -mt-1 text-sm text-muted-foreground')}>{t('invite.cardBody')}</p>
      <input
        className={cn('fsl-invite__input box-border w-full min-w-0 min-h-11 px-3 bg-muted border border-border rounded-lg text-base text-foreground truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        aria-label={t('share.groupLink')}
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
      />
      <div className={cn('fsl-invite__buttons flex flex-col sm:flex-row gap-2')}>
        <Button variant="primary" block className="sm:flex-1" onClick={share}>
          <Icon name="share" size={18} />
          {t('invite.share')}
        </Button>
        <Button variant="secondary" block className="sm:flex-1" onClick={copy}>
          <Icon name="copy" size={18} />
          {copied ? t('share.copied') : t('share.copy')}
        </Button>
      </div>
      <span aria-live="polite" className={cn('fsl-invite__sr sr-only')}>{copied ? t('share.copied') : ''}</span>
    </section>
  );
}

