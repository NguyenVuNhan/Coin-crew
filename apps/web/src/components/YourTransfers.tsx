import { useEffect, useId, useState, type JSX } from 'react';
import { formatVnd, type PaymentView, type Transfer, type TripView } from '@fsl/core';
import { useT, getLang } from '../i18n';
import { nameOf } from '../lib/tripText';
import { canManageBankOf } from '../lib/rowActions';
import { groupLink, remind, remindText } from '../lib/remind';
import { usePayInfo } from '../api/payInfo';
import { useIsCoarsePointer } from '../lib/media';
import { usePendingPayment, type PendingPayment } from '../lib/usePendingPayment';
import { SwipeGroupProvider } from '../lib/useSwipeReveal';
import { ActionRow, type RowAction } from './ActionRow';
import { Amount } from './Amount';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Icon } from './icons';
import { InlineError } from './InlineError';
import { PayQr } from './PayQr';
import { Pill } from './Pill';
import { Skeleton } from './Skeleton';
import { Snackbar } from './Snackbar';
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
    if (info.amount === 0 || info.payload === null) {
      return <p className="fsl-transfers__note">{t('transfers.nothingDue', { name: nameOf(view, row.fromId) })}</p>;
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
        {canManageBankOf(view, row.toId) && (
          <Button href={`/t/${tripId}/people/${row.toId}/bank`} variant="secondary" block>
            {t('transfers.addFor', { name: info.to.name })}
          </Button>
        )}
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

  if (info.amount === 0 || info.payload === null) {
    return <p className="fsl-transfers__note">{t('pay.nothingOwed', { name: info.to.name })}</p>;
  }

  return <PayQr info={info} variant="pay" />;
}

/** What Your transfers keeps when the page switches layout: the open row and a tick waiting out its Undo. */
export interface TransfersState {
  openKey: string | null;
  setOpenKey(key: string | null): void;
  ticks: ReturnType<typeof usePendingPayment>;
}

/**
 * Your transfers' state, for a trip page to hold above its phone / layout A branch (ruling R-Z). Crossing 1024px swaps
 * the two trees: state kept inside the section would close an open QR row, and unmounting would send a pending tick
 * at once with its Undo gone.
 */
export function useTransfersState(view: TripView): TransfersState {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const ticks = usePendingPayment(view.trip.id);
  const { pending, undo } = ticks;
  // A new version of the trip can take the ticked transfer away while Undo is on offer (the other side recorded it, or
  // claimed it). Sending the tick then would count the money twice: cancel it, and its snackbar goes with it. This
  // runs here, not in the section, so it also holds while layout A shows details in place of the section.
  useEffect(() => {
    if (pending !== null && !view.suggestions.some((s) => s.fromId === pending.fromId && s.toId === pending.toId)) undo();
  }, [pending, view.suggestions, undo]);
  return { openKey, setOpenKey, ticks };
}

/** The Undo snackbar of a pending tick (or the error of a failed one), wherever the page shows Your transfers. */
export function TransfersSnackbar({ view, state }: { view: TripView; state: TransfersState }): JSX.Element | null {
  const t = useT();
  const { pending, error, undo } = state.ticks;
  if (pending) {
    const undoAndFocus = () => {
      undo();
      document.querySelector<HTMLElement>(`[data-tick="${pending.fromId}>${pending.toId}"]`)?.focus();
    };
    return (
      <Snackbar
        message={
          pending.fromId === view.me.participantId
            ? t('transfers.paidSnack', { name: nameOf(view, pending.toId), amount: formatVnd(pending.amount) })
            : t('transfers.receivedSnack', { name: nameOf(view, pending.fromId), amount: formatVnd(pending.amount) })
        }
        actionLabel={t('common.undo')}
        onAction={undoAndFocus}
      />
    );
  }
  return error !== null ? <Snackbar message={t('error.generic')} /> : null;
}

/**
 * The trip's transfers list showing who owes whom, with in-place VietQR codes. A page that switches layout passes
 * `state` from `useTransfersState` and renders `TransfersSnackbar` itself; without it the section keeps its own.
 */
export function YourTransfers({ view, state }: { view: TripView; state?: TransfersState }): JSX.Element {
  return state ? <TransfersSection view={view} state={state} /> : <OwnTransfers view={view} />;
}

function OwnTransfers({ view }: { view: TripView }): JSX.Element {
  const state = useTransfersState(view);
  return (
    <>
      <TransfersSection view={view} state={state} />
      <TransfersSnackbar view={view} state={state} />
    </>
  );
}

function TransfersSection({ view, state }: { view: TripView; state: TransfersState }): JSX.Element {
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

  const { openKey, setOpenKey } = state;
  const openRow = rows.find((s) => keyOf(s) === openKey && involvesMe(s)) ?? null;

  useEffect(() => {
    if (openKey !== null && openRow === null) {
      setOpenKey(null);
    }
  }, [openKey, openRow, setOpenKey]);

  const title = effectiveMode === 'mine' ? t('transfers.mine') : t('transfers.all');

  const coarse = useIsCoarsePointer();
  const uid = useId();
  const { pending, sending, schedule, undo } = state.ticks;

  // Ticks confirm that money moved: only for someone who can record payments right now.
  const canTick = me !== null && !view.trip.archived && view.me.kind !== 'viewer' && !view.me.participantPending;
  const isMember = (id: string) => view.people.find((p) => p.id === id)?.isMember === true;
  // Someone who left still shows here until settled, marked so nobody wonders why they are not in the group.
  const leftIn = (s: Transfer) => [s.fromId, s.toId].some((id) => view.people.find((p) => p.id === id)?.status === 'left');
  const leftPill = <Pill tone="neutral">{t('people.leftBadge')}</Pill>;
  /** A guest paying me ('received') or my own debt ('paid'). A member paying me marks it themselves, so no tick. */
  const tickOf = (s: Transfer): 'received' | 'paid' | null => {
    if (!canTick) return null;
    if (s.toId === me && !isMember(s.fromId)) return 'received';
    if (s.fromId === me) return 'paid';
    return null;
  };
  const samePair = (p: PendingPayment, s: Transfer) => p.fromId === s.fromId && p.toId === s.toId;

  // My "says paid" payments leave the suggestions until the receiver confirms them: show them as waiting rows.
  const waiting: PaymentView[] = me === null ? [] : view.payments.filter((p) => p.status === 'says_paid' && p.fromId === me);
  // When any row has a tick (or a waiting clock), the other rows keep the same space so the initials line up.
  const aligned = waiting.length > 0 || rows.some((s) => tickOf(s) !== null);

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

      {view.suggestions.length === 0 && waiting.length === 0 ? (
        <p className="fsl-transfers__empty">{t('trip.allSettled')}</p>
      ) : rows.length === 0 && waiting.length === 0 ? (
        <p className="fsl-transfers__empty">{t('balance.settled')}</p>
      ) : (
        <SwipeGroupProvider>
          <ul className="fsl-transfers__list">
            {rows.map((s) => {
              const key = keyOf(s);
              const isOpen = openRow !== null && key === keyOf(openRow);
              const involves = involvesMe(s);
              const rowTitle = t('trip.pays', { from: label(s.fromId), to: label(s.toId) });

              const kind = tickOf(s);
              const isPending = pending !== null && samePair(pending, s);
              const isSending = sending.some((p) => samePair(p, s));
              const done = isPending || isSending;
              const detailId = `${uid}-detail-${s.fromId}-${s.toId}`;
              const confirm = () => schedule({ fromId: s.fromId, toId: s.toId, amount: s.amount });
              const tickLabel =
                kind === 'received'
                  ? t('transfers.markReceived', { amount: formatVnd(s.amount), name: nameOf(view, s.fromId) })
                  : t('transfers.markPaid', { amount: formatVnd(s.amount), name: nameOf(view, s.toId) });
              const leading =
                kind !== null ? (
                  <button
                    type="button"
                    className={`fsl-transfers__tick${done ? ' fsl-transfers__tick--done' : ''}`}
                    aria-label={tickLabel}
                    title={tickLabel}
                    aria-pressed={done}
                    aria-disabled={isSending || undefined}
                    data-tick={key}
                    onClick={() => {
                      if (isSending) return; // already on its way: never undo or record it twice
                      if (isPending) undo();
                      else confirm();
                    }}
                  >
                    <span className="fsl-transfers__tick-circle" aria-hidden="true">
                      {done && <Icon name="check" size={14} />}
                    </span>
                  </button>
                ) : aligned ? (
                  <span className="fsl-transfers__tick-space" aria-hidden="true" />
                ) : undefined;
              // Phones: the same confirmation behind a swipe. Not while it is ticked, so it can't be sent twice.
              const actions: RowAction[] =
                coarse && kind !== null && !done
                  ? [{ id: 'confirm', label: t(kind === 'received' ? 'transfers.received' : 'transfers.paid'), icon: 'check', tone: 'success', onSelect: confirm }]
                  : [];

              return (
                <li key={key} className="fsl-transfers__item" data-testid={'transfer-' + s.fromId + '-' + s.toId}>
                  {involves ? (
                    <>
                      <ActionRow
                        label={rowTitle + ', ' + formatVnd(s.amount)}
                        actions={actions}
                        expanded={isOpen}
                        controls={isOpen ? detailId : undefined}
                        leading={leading}
                        onOpen={() => setOpenKey(isOpen ? null : key)}
                      >
                        <Avatar name={nameOf(view, s.fromId)} avatarUrl={view.people.find((person) => person.id === s.fromId)?.avatarUrl} size="sm" />
                        <span className={`fsl-transfers__text${done ? ' fsl-transfers__text--done' : ''}`}>{rowTitle}</span>
                        {leftIn(s) && leftPill}
                        <Amount value={s.amount} />
                        <Icon
                          name={isOpen ? 'chevronUp' : 'chevronDown'}
                          size={20}
                          className="fsl-transfers__chevron"
                        />
                      </ActionRow>
                      {isOpen && (
                        <div className="fsl-transfers__detail" id={detailId}>
                          <TransferDetail view={view} row={openRow} />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={`fsl-transfers__plain${aligned ? ' fsl-transfers__plain--aligned' : ''}`}>
                      <Avatar name={nameOf(view, s.fromId)} avatarUrl={view.people.find((person) => person.id === s.fromId)?.avatarUrl} size="sm" />
                      <span className="fsl-transfers__text">{rowTitle}</span>
                      {leftIn(s) && leftPill}
                      <Amount value={s.amount} />
                    </div>
                  )}
                </li>
              );
            })}
            {waiting.map((p) => (
              <li key={p.id} className="fsl-transfers__item" data-testid={'waiting-' + p.id}>
                <div className="fsl-transfers__plain fsl-transfers__plain--waiting">
                  <span className="fsl-transfers__tick-space fsl-transfers__tick-space--waiting" aria-hidden="true">
                    <Icon name="clock" size={18} />
                  </span>
                  <Avatar name={nameOf(view, p.fromId)} avatarUrl={view.people.find((person) => person.id === p.fromId)?.avatarUrl} size="sm" />
                  <span className="fsl-transfers__text-block">
                    <span className="fsl-transfers__text">{t('trip.pays', { from: label(p.fromId), to: label(p.toId) })}</span>
                    <span className="fsl-transfers__sub">{t('transfers.waitingFor', { name: nameOf(view, p.toId) })}</span>
                  </span>
                  <Amount value={p.amountClaimed} />
                </div>
              </li>
            ))}
          </ul>
        </SwipeGroupProvider>
      )}
    </section>
  );
}
