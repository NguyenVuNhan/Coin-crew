import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { Button } from './Button';
import { InlineError } from './InlineError';
import './ShareLinks.css';

function LinkBlock({ tripId, which, token, title, hint }: { tripId: string; which: 'group' | 'view'; token: string; title: string; hint: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const url = `${location.origin}/j/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the URL stays selectable in the input.
    }
  }

  async function regenerate() {
    if (!window.confirm(t('share.regenerateConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/trips/${tripId}/links/regenerate`, 'POST', { which }, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fsl-share__block">
      <label htmlFor={inputId} className="fsl-share__label">{title}</label>
      <p className="fsl-share__hint">{hint}</p>
      <div className="fsl-share__row">
        <input id={inputId} className="fsl-share__input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <Button variant="secondary" onClick={copy}>{copied ? t('share.copied') : t('share.copy')}</Button>
      </div>
      <span aria-live="polite" className="fsl-share__sr">{copied ? t('share.copied') : ''}</span>
      <Button variant="ghost" loading={busy} onClick={regenerate}>{t('share.regenerate')}</Button>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}

/** Group link and view-only link, with copy and regenerate. Members only. */
export function ShareLinks({ view }: { view: TripView }) {
  const t = useT();
  if (!view.links) return null;
  return (
    <section className="fsl-share" aria-label={t('share.title')}>
      <h2 className="fsl-share__heading">{t('share.title')}</h2>
      <div className="fsl-share__card">
        <LinkBlock tripId={view.trip.id} which="group" token={view.links.group} title={t('share.groupLink')} hint={t('share.groupHint')} />
        <LinkBlock tripId={view.trip.id} which="view" token={view.links.view} title={t('share.viewLink')} hint={t('share.viewHint')} />
      </div>
    </section>
  );
}
