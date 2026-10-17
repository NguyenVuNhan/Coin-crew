import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TripView } from '@fsl/core';
import { useT, useLang } from '../i18n';
import { apiSend } from '../api/client';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Icon } from './icons';
import { InlineError } from './InlineError';
import './InviteSheet.css';

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
    <fieldset className="fsl-invite__block">
      <legend id={legendId} className="fsl-invite__label">{title}</legend>
      <div className="fsl-invite__body">
        <p className="fsl-invite__hint">{hint}</p>
        <input
          className="fsl-invite__input"
          aria-labelledby={legendId}
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
        />
        <div className="fsl-invite__buttons">
          <Button variant={primary ? 'primary' : 'secondary'} onClick={share}>
            <Icon name="share" size={18} />
            {t('invite.share')}
          </Button>
          <Button variant="secondary" onClick={copy}>
            <Icon name="copy" size={18} />
            {copied ? t('share.copied') : t('share.copy')}
          </Button>
        </div>
        <span aria-live="polite" className="fsl-invite__sr">{copied ? t('share.copied') : ''}</span>
        <Button variant="ghost" className="fsl-invite__regenerate" loading={busy} onClick={regenerate}>
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
      <div className="fsl-invite">
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
    <section className="fsl-invite-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="fsl-invite-card__title">{t('invite.cardTitle')}</h2>
      <p className="fsl-invite-card__body">{t('invite.cardBody')}</p>
      <input
        className="fsl-invite__input"
        aria-label={t('share.groupLink')}
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
      />
      <div className="fsl-invite__buttons">
        <Button variant="primary" onClick={share}>
          <Icon name="share" size={18} />
          {t('invite.share')}
        </Button>
        <Button variant="secondary" onClick={copy}>
          <Icon name="copy" size={18} />
          {copied ? t('share.copied') : t('share.copy')}
        </Button>
      </div>
      <span aria-live="polite" className="fsl-invite__sr">{copied ? t('share.copied') : ''}</span>
    </section>
  );
}
