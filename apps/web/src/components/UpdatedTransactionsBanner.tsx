import { useMemo, useState } from 'react';
import type { ExpenseView, TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { Button } from './Button';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import './UpdatedTransactionsBanner.css';

export interface UpdatedTransactionsBannerProps {
  view: TripView;
}

function getSeenIds(tripId: string): string[] {
  try {
    const raw = localStorage.getItem(`fsl_seen_tx_updates_${tripId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markSeen(tripId: string, ids: string[]) {
  try {
    const current = getSeenIds(tripId);
    const set = new Set([...current, ...ids]);
    localStorage.setItem(`fsl_seen_tx_updates_${tripId}`, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

export function UpdatedTransactionsBanner({ view }: UpdatedTransactionsBannerProps) {
  const t = useT();
  const myId = view.me.participantId;

  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeUpdates, setActiveUpdates] = useState<ExpenseView[]>([]);

  const unseen = useMemo(() => {
    if (!myId) return [];
    const seenIds = getSeenIds(view.trip.id);
    return view.expenses.filter((e) => {
      if (!e.history || e.history.length === 0) return false;
      if (e.status === 'rejected' || e.status === 'disabled') return false;
      if (e.createdById === myId) return false;
      if (seenIds.includes(e.id)) return false;

      const involvedNow = e.payerId === myId || (e.shares ?? []).some((s) => s.participantId === myId);
      const involvedBefore = e.history.some(
        (h) => h.payerId === myId || (h.shares ?? []).some((s) => s.participantId === myId),
      );
      return involvedNow || involvedBefore;
    });
  }, [view.expenses, view.trip.id, myId]);

  if ((unseen.length === 0 || dismissed) && !modalOpen) {
    return null;
  }

  const handleOpen = () => {
    const ids = unseen.map((e) => e.id);
    markSeen(view.trip.id, ids);
    setActiveUpdates(unseen);
    setModalOpen(true);
  };

  const handleDismiss = () => {
    const ids = unseen.map((e) => e.id);
    markSeen(view.trip.id, ids);
    setModalOpen(false);
    setDismissed(true);
  };

  const displayExpenses = activeUpdates.length > 0 ? activeUpdates : unseen;

  return (
    <>
      {!dismissed && unseen.length > 0 && (
        <aside className="fsl-updated-banner" aria-label={t('updates.bannerTitle')}>
          <div className="fsl-updated-banner__info">
            <Icon name="rotateCcw" size={18} />
            <span className="fsl-updated-banner__text">{t('updates.bannerTitle')}</span>
          </div>
          <Button variant="secondary" className="fsl-updated-banner__btn" onClick={handleOpen}>
            {t('updates.viewAll')}
          </Button>
        </aside>
      )}

      <Sheet
        open={modalOpen}
        onClose={handleDismiss}
        title={t('updates.bannerTitle')}
        className="fsl-updated-sheet"
      >
        <div className="fsl-updated-modal">
          <ul className="fsl-updated-modal__list">
            {displayExpenses.map((e) => {
              const prev = e.history?.[0];
              const prevAmount = prev ? prev.amount : e.amount;
              const prevShare = prev
                ? (prev.shares.find((s) => s.participantId === myId)?.amount ?? 0)
                : 0;
              const nextShare = e.shares.find((s) => s.participantId === myId)?.amount ?? 0;

              return (
                <li key={e.id} className="fsl-updated-modal__item">
                  <div className="fsl-updated-modal__desc">{e.description}</div>
                  <div className="fsl-updated-modal__row">
                    <span>
                      {formatVnd(prevAmount)} → {formatVnd(e.amount)}
                    </span>
                  </div>
                  <div className="fsl-updated-modal__shares">
                    <span>
                      {t('updates.previous')}: {formatVnd(prevShare)} → {t('updates.now')}: {formatVnd(nextShare)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="fsl-updated-modal__footer">
            <Button variant="primary" onClick={handleDismiss}>
              {t('updates.dismiss')}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
