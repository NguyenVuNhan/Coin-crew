import { useEffect, useState, type JSX } from 'react';
import { formatVnd, type Transfer, type TripView } from '@fsl/core';
import { useT, getLang } from '../i18n';
import { nameOf } from '../lib/tripText';
import { groupLink, remind, remindText } from '../lib/remind';
import { usePayInfo } from '../api/payInfo';
import { ActionRow } from './ActionRow';
import { Amount } from './Amount';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Icon } from './icons';
import { InlineError } from './InlineError';
import { PayQr } from './PayQr';
import { Skeleton } from './Skeleton';
import './YourTransfers.css';

/** In-place detail for an open transfer row, showing QR code or bank status. */
function TransferDetail({ view, row }: { view: TripView; row: Transfer }): JSX.Element | null {
  const t = useT();
  const tripId = view.trip.id;
  const me = view.me.participantId as string;
  const owed = row.toId === me;
  const {
    data: info,
    error,
    isLoading,
    refetch,
  } = usePayInfo({
    tripId,
    toId: owed ? me : row.toId,
    fromId: owed ? row.fromId : undefined,
    enabled: true,
    version: view.trip.version,
  });
  const [copied, setCopied] = useState(false);

  if (isLoading || (!info && !error)) {
    return (
      <div className="fsl-transfers__loading">
        <Skeleton width={240} height={240} radius="lg" />
      </div>
    );
  }

  if (error) {
    return <InlineError error={error} onRetry={() => void refetch()} />;
  }

  if (!info) {
    return null;
  }

  if (owed) {
    if (info.bankState !== 'ok') {
      return (
        <Button href={'/t/' + tripId + '/bank'} variant="secondary" block>
          {t('transfers.addBank')}
        </Button>
      );
    }
    return (
      <PayQr
        info={info}
        variant="receive"
        shareText={remindText(getLang(), {
          name: nameOf(view, row.fromId),
          creditor: nameOf(view, me),
          amount: formatVnd(info.amount),
          trip: view.trip.name,
          link: groupLink(view),
        })}
      />
    );
  }

  if (info.bankState === 'none') {
    return (
      <>
        <p className="fsl-transfers__note">{t('pay.bankNone', { name: info.to.name })}</p>
        <Button
          variant="secondary"
          block
          onClick={() => {
            const text = t('pay.remindBankText', {
              name: info.to.name,
              trip: view.trip.name,
              link: groupLink(view),
            });
            void remind(text).then((r) => setCopied(r === 'copied'));
          }}
        >
          {t('pay.remindThem', { name: info.to.name })}
        </Button>
        <p className="fsl-transfers__note" aria-live="polite">{copied ? t('whoPays.remindCopied') : null}</p>
      </>
    );
  }

  if (info.bankState === 'pending') {
    return <p className="fsl-transfers__note">{t('pay.bankPending', { name: info.to.name })}</p>;
  }

  if (info.bankState === 'ok' && info.amount === 0 && info.inFlight.length > 0) {
    return <p className="fsl-transfers__note">{t('pay.waitingConfirm', { name: info.to.name })}</p>;
  }

  return <PayQr info={info} variant="pay" />;
}

/** The trip's transfers list showing who owes whom, with in-place VietQR codes. */
export function YourTransfers({ view }: { view: TripView }): JSX.Element {
  const t = useT();
  const me = view.me.participantId;
  const [mode, setMode] = useState<'mine' | 'all'>(() => {
    try {
      return localStorage.getItem('fsl.transfers.mode') === 'all' ? 'all' : 'mine';
    } catch {
      return 'mine';
    }
  });

  const toggle = () => {
    const next = mode === 'mine' ? 'all' : 'mine';
    setMode(next);
    try {
      localStorage.setItem('fsl.transfers.mode', next);
    } catch {
      // storage blocked
    }
  };

  const effectiveMode = me === null ? 'all' : mode;
  const involvesMe = (s: Transfer) => me !== null && (s.fromId === me || s.toId === me);
  const keyOf = (s: Transfer) => s.fromId + '>' + s.toId;
  const label = (id: string) => (id === me ? t('trip.you') : nameOf(view, id));

  const rows = effectiveMode === 'mine' ? view.suggestions.filter(involvesMe) : view.suggestions;

  const [openKey, setOpenKey] = useState<string | null>(null);
  const openRow = rows.find((s) => keyOf(s) === openKey && involvesMe(s)) ?? null;

  useEffect(() => {
    if (openKey !== null && openRow === null) {
      setOpenKey(null);
    }
  }, [openKey, openRow]);

  const title = effectiveMode === 'mine' ? t('transfers.mine') : t('transfers.all');

  return (
    <section className="fsl-transfers" aria-label={title}>
      <div className="fsl-transfers__top">
        <h2 className="fsl-transfers__title">{title}</h2>
        {me !== null && view.suggestions.length > 0 && (
          <button type="button" className="fsl-transfers__chip" onClick={toggle}>
            <span className="fsl-transfers__chip-pill">
              {mode === 'mine' ? t('transfers.showAll') : t('transfers.showMine')}
            </span>
          </button>
        )}
      </div>

      {view.suggestions.length === 0 ? (
        <p className="fsl-transfers__empty">{t('trip.allSettled')}</p>
      ) : rows.length === 0 ? (
        <p className="fsl-transfers__empty">{t('balance.settled')}</p>
      ) : (
        <ul className="fsl-transfers__list">
          {rows.map((s) => {
            const key = keyOf(s);
            const isOpen = openRow !== null && key === keyOf(openRow);
            const involves = involvesMe(s);
            const rowTitle = t('trip.pays', { from: label(s.fromId), to: label(s.toId) });

            return (
              <li key={key} className="fsl-transfers__item" data-testid={'transfer-' + s.fromId + '-' + s.toId}>
                {involves ? (
                  <>
                    <ActionRow
                      label={rowTitle + ', ' + formatVnd(s.amount)}
                      actions={[]}
                      expanded={isOpen}
                      onOpen={() => setOpenKey(isOpen ? null : key)}
                    >
                      <Avatar name={label(s.fromId)} size="sm" />
                      <span className="fsl-transfers__text">{rowTitle}</span>
                      <Amount value={s.amount} />
                      <Icon
                        name={isOpen ? 'chevronUp' : 'chevronDown'}
                        size={20}
                        className="fsl-transfers__chevron"
                      />
                    </ActionRow>
                    {isOpen && (
                      <div className="fsl-transfers__detail">
                        <TransferDetail view={view} row={openRow} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="fsl-transfers__plain">
                    <Avatar name={label(s.fromId)} size="sm" />
                    <span className="fsl-transfers__text">{rowTitle}</span>
                    <Amount value={s.amount} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
