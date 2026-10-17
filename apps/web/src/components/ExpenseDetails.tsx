import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ExpenseView, TripView } from '@fsl/core';
import { formatVnd, computeSportShares } from '@fsl/core';
import { useT, useLang } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { nameOf, splitText } from '../lib/tripText';
import { formatDay } from '../lib/time';
import { useTripAction } from '../lib/useTripAction';
import { expenseActions } from '../lib/rowActions';
import { ApiClientError } from '../api/client';
import { Amount } from './Amount';
import { Pill, type PillProps } from './Pill';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { InlineError } from './InlineError';
import { Icon } from './icons';
import { usePayInfo } from '../api/payInfo';
import { useQrSvg, qrSrc, shareSportBill, type SportBillCardInput } from '../lib/qr';
import { sportShareText, groupLink } from '../lib/remind';
import { ExpenseHistoryList } from './ExpenseHistoryList';
import './ExpenseDetails.css';

const STATUS: Record<ExpenseView['status'], { tone: PillProps['tone']; label: MessageKey }> = {
  approved: { tone: 'success', label: 'status.approved' },
  pending: { tone: 'warning', label: 'status.waiting' },
  rejected: { tone: 'danger', label: 'status.rejected' },
  disabled: { tone: 'neutral', label: 'status.disabled' },
};

/** The details of one expense, shown as a full-screen phone page or wide right panel. */
export function ExpenseDetails({
  view,
  expenseId,
  onClose,
}: {
  view: TripView;
  expenseId: string;
  onClose(): void;
}) {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const { busy, error, run } = useTripAction(view.trip.id);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<'saved' | 'failed' | null>(null);
  const reasonId = useId();

  const e = view.expenses.find((x) => x.id === expenseId || x.rootId === expenseId);

  const { data: payInfo } = usePayInfo({
    tripId: view.trip.id,
    toId: e?.payerId ?? '',
    bill: true,
    enabled: Boolean(e?.meta?.sport),
    version: view.trip.version,
  });
  const qrSvg = useQrSvg(payInfo?.payload ?? null);

  if (!e) {
    return (
      <EmptyState
        icon="receipt"
        title={t('details.gone')}
        action={<Button onClick={onClose}>{t('details.backToTrip')}</Button>}
      />
    );
  }

  const status = STATUS[e.status];

  const whoText = (id: string) => (id === view.me.participantId ? t('trip.you') : nameOf(view, id));

  let errorElement = null;
  if (error instanceof ApiClientError && error.code === 'PERSON_PENDING') {
    const pendingId = [e.payerId, ...e.shares.map((s) => s.participantId)].find(
      (id) => view.people.find((p) => p.id === id)?.status === 'pending',
    );
    if (pendingId) {
      errorElement = (
        <p className="fsl-details__error" role="alert">
          {t('approvals.approveNameFirst', { name: nameOf(view, pendingId) })}
        </p>
      );
    } else {
      errorElement = <InlineError error={error} />;
    }
  } else if (error) {
    errorElement = <InlineError error={error} />;
  }

  const actions = expenseActions(view, e, {
    t,
    navigate,
    run,
    onReject: () => setRejecting(true),
  });
  const showReason = rejecting && e.status === 'pending';
  // The API sends shares in storage order; list them in the trip's order of people, like every other list.
  const place = new Map(view.people.map((p, i) => [p.id, i]));
  const shares = [...e.shares].sort(
    (a, b) => (place.get(a.participantId) ?? view.people.length) - (place.get(b.participantId) ?? view.people.length),
  );

  const sportCalc = useMemo(() => {
    if (!e.meta?.sport) return null;
    const sport = e.meta.sport;
    const court = sport.court ?? 0;
    const shuttlecocksTotal =
      sport.shuttlecocks?.reduce((acc, s) => acc + (s.qty || 0) * (s.unitPrice || 0), 0) ?? 0;
    const extra = sport.extra ?? 0;

    const participants = shares.map((s) => {
      const person = view.people.find((p) => p.id === s.participantId);
      const rosterGender = person?.gender ?? null;
      const entry = sport.entries?.find((en) => en.participantId === s.participantId);
      const maleSlots = entry ? entry.maleSlots : rosterGender === 'F' ? 0 : 1;
      const femaleSlots = entry ? entry.femaleSlots : rosterGender === 'F' ? 1 : 0;
      const fixedAmount = entry?.fixedAmount ?? null;
      return {
        participantId: s.participantId,
        name: nameOf(view, s.participantId),
        rosterGender,
        maleSlots,
        femaleSlots,
        fixedAmount,
        amount: s.amount,
      };
    });

    const rule = sport.rule ?? { kind: 'equal' };
    const calc = computeSportShares(
      e.amount,
      rule,
      participants.map((p) => ({
        participantId: p.participantId,
        maleSlots: p.maleSlots,
        femaleSlots: p.femaleSlots,
        fixedAmount: p.fixedAmount,
      })),
    );

    const totalMaleSlots = calc.ok
      ? calc.totalMaleSlots
      : sport.entries?.reduce((acc, x) => acc + (x.fixedAmount ? 0 : x.maleSlots), 0) ?? 0;
    const totalFemaleSlots = calc.ok
      ? calc.totalFemaleSlots
      : sport.entries?.reduce((acc, x) => acc + (x.fixedAmount ? 0 : x.femaleSlots), 0) ?? 0;
    const maleSlotRate = calc.ok ? calc.maleSlotRate : (sport.maleSlotRate ?? 0);
    const femaleSlotRate = calc.ok ? calc.femaleSlotRate : (sport.femaleSlotRate ?? 0);

    return {
      court,
      shuttlecocksTotal,
      extra,
      totalMaleSlots,
      totalFemaleSlots,
      maleSlotRate,
      femaleSlotRate,
      participants,
    };
  }, [e, shares, view]);

  const msgText = useMemo(() => {
    if (!sportCalc) return '';
    const link = groupLink(view);
    return sportShareText(lang, {
      court: sportCalc.court,
      shuttlecocksTotal: sportCalc.shuttlecocksTotal,
      extra: sportCalc.extra,
      maleSlotRate: sportCalc.maleSlotRate,
      femaleSlotRate: sportCalc.femaleSlotRate,
      totalMaleSlots: sportCalc.totalMaleSlots,
      totalFemaleSlots: sportCalc.totalFemaleSlots,
      participants: sportCalc.participants,
      link,
    });
  }, [sportCalc, lang, view]);

  const handleShareSportBill = async () => {
    if (!sportCalc) return;
    setSharing(true);
    setShareStatus(null);
    try {
      const billInput: SportBillCardInput = {
        description: e.description,
        spentOn: formatDay(e.spentOn),
        groupName: view.trip.name,
        total: e.amount,
        court: sportCalc.court,
        shuttlecocksTotal: sportCalc.shuttlecocksTotal,
        extra: sportCalc.extra,
        maleSlotRate: sportCalc.maleSlotRate,
        femaleSlotRate: sportCalc.femaleSlotRate,
        totalMaleSlots: sportCalc.totalMaleSlots,
        totalFemaleSlots: sportCalc.totalFemaleSlots,
        rows: sportCalc.participants.map((p) => ({
          name: p.name,
          femaleSlots: p.femaleSlots,
          maleSlots: p.maleSlots,
          isFixed: p.fixedAmount !== null && p.fixedAmount !== undefined,
          amount: p.amount,
        })),
        payerName: nameOf(view, e.payerId),
        bank: payInfo?.bankState === 'ok' && payInfo.bank ? payInfo.bank : null,
        qrSvg: qrSvg || undefined,
      };

      const res = await shareSportBill(billInput, msgText, payInfo?.refCode ?? e.description);
      if (res === 'saved') {
        setShareStatus('saved');
      } else if (res === 'failed') {
        setShareStatus('failed');
      }
    } catch {
      setShareStatus('failed');
    } finally {
      setSharing(false);
    }
  };

  return (
    <article className="fsl-details">
      <div className="fsl-details__head">
        <h2 className="fsl-details__title" tabIndex={-1}>{e.description}</h2>
        <Pill tone={status.tone}>{t(status.label)}</Pill>
      </div>

      <Amount value={e.amount} size="xl" />

      {e.status === 'rejected' && e.rejectReason ? (
        <p className="fsl-details__note fsl-details__note--danger">
          {t('expense.rejectedBecause', { reason: e.rejectReason })}
        </p>
      ) : null}
      {e.status === 'disabled' && e.disabledByName ? (
        <p className="fsl-details__note">
          {t('expenses.disabledBy', { name: e.disabledByName })}
        </p>
      ) : null}

      <dl className="fsl-details__facts">
        <div className="fsl-details__fact">
          <dt>{t('details.date')}</dt>
          <dd>{formatDay(e.spentOn)}</dd>
        </div>
        <div className="fsl-details__fact">
          <dt>{t('details.paidBy')}</dt>
          <dd>{whoText(e.payerId)}</dd>
        </div>
        <div className="fsl-details__fact">
          <dt>{t('details.addedBy')}</dt>
          <dd>{whoText(e.createdById)}</dd>
        </div>
        <div className="fsl-details__fact">
          <dt>{t('details.split')}</dt>
          <dd>
            {e.meta?.sport
              ? splitText(e, t)
              : e.mode === 'equal'
                ? `${t('split.tab.equal')}, ${t('trip.people', { n: e.shares.length })}`
                : splitText(e, t)}
          </dd>
        </div>
      </dl>

      {sportCalc ? (
        <>
          <div className="fsl-sport-table-container">
            <table className="fsl-sport-table">
              <thead>
                <tr>
                  <th scope="col">{t('sport.tableColName')}</th>
                  <th scope="col" className="fsl-sport-table__col--center">{t('sport.tableColFemale')}</th>
                  <th scope="col" className="fsl-sport-table__col--center">{t('sport.tableColMale')}</th>
                  <th scope="col" className="fsl-sport-table__col--right">{t('sport.tableColAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {sportCalc.participants.map((p) => {
                  const isMe = p.participantId === view.me.participantId;
                  const displayName = isMe ? t('details.you', { name: p.name }) : p.name;
                  const isFixed = p.fixedAmount !== null && p.fixedAmount !== undefined;
                  return (
                    <tr key={p.participantId}>
                      <td>
                        <span>{displayName}</span>
                        {isFixed && (
                          <span className="fsl-sport-table__fixed"> ({t('sport.fixedBadge')})</span>
                        )}
                      </td>
                      <td className="fsl-sport-table__col--center fsl-num">
                        {p.femaleSlots > 0 ? p.femaleSlots : '—'}
                      </td>
                      <td className="fsl-sport-table__col--center fsl-num">
                        {p.maleSlots > 0 ? p.maleSlots : '—'}
                      </td>
                      <td className="fsl-sport-table__col--right fsl-num">
                        <Amount value={p.amount} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="fsl-sport-table__row--total-slots">
                  <th scope="row">{t('sport.tableTotalSlots')}</th>
                  <td className="fsl-sport-table__col--center fsl-num">{sportCalc.totalFemaleSlots}</td>
                  <td className="fsl-sport-table__col--center fsl-num">{sportCalc.totalMaleSlots}</td>
                  <td className="fsl-sport-table__col--right fsl-num">
                    {sportCalc.totalFemaleSlots + sportCalc.totalMaleSlots} {t('split.mode.shares').toLowerCase()}
                  </td>
                </tr>
                <tr className="fsl-sport-table__row--costs">
                  <th scope="row">{t('sport.tableCosts')}</th>
                  <td colSpan={2} className="fsl-sport-table__col--center fsl-sport-table__cost-summary">
                    {[
                      sportCalc.court > 0 ? `${t('sport.court')}: ${formatVnd(sportCalc.court)}` : null,
                      sportCalc.shuttlecocksTotal > 0 ? `${t('sport.shuttlecocks')}: ${formatVnd(sportCalc.shuttlecocksTotal)}` : null,
                      sportCalc.extra > 0 ? `${t('sport.extra')}: ${formatVnd(sportCalc.extra)}` : null,
                    ].filter(Boolean).join(' · ')}
                  </td>
                  <td className="fsl-sport-table__col--right fsl-num">
                    <Amount value={e.amount} />
                  </td>
                </tr>
                <tr className="fsl-sport-table__row--per-slot">
                  <th scope="row">{t('sport.tablePerSlot')}</th>
                  <td className="fsl-sport-table__col--center fsl-num">
                    <Amount value={sportCalc.femaleSlotRate} />
                  </td>
                  <td className="fsl-sport-table__col--center fsl-num">
                    <Amount value={sportCalc.maleSlotRate} />
                  </td>
                  <td className="fsl-sport-table__col--right">—</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="fsl-sport-preview-card">
            <h3 className="fsl-sport-preview-title">{t('sport.zaloPreviewTitle')}</h3>
            <p className="fsl-sport-preview-msg">{msgText}</p>
            <Button
              variant="primary"
              loading={sharing}
              onClick={handleShareSportBill}
            >
              <Icon name="share" size={18} />
              {t('sport.shareBillQr')}
            </Button>
            {shareStatus === 'saved' && (
              <p className="fsl-sport-share-status" role="status">
                {t('pay.shareSaved')}
              </p>
            )}
            {shareStatus === 'failed' && (
              <p className="fsl-sport-share-status fsl-sport-share-status--danger" role="alert">
                {t('pay.shareFailed')}
              </p>
            )}
            {qrSvg && payInfo?.bank && (
              <div className="fsl-sport-preview-qr">
                <img
                  src={qrSrc(qrSvg)}
                  alt={t('pay.qrAlt', { name: nameOf(view, e.payerId), amount: formatVnd(e.amount) })}
                  className="fsl-sport-preview-qr__img"
                />
                <p className="fsl-sport-preview-qr__bank">
                  {payInfo.bank.bankName} · {payInfo.bank.accountNumberMasked || payInfo.bank.accountNumber} · {payInfo.bank.holderName}
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <ul className="fsl-details__shares" aria-label={t('details.split')}>
          {shares.map((s) => {
            const isMe = s.participantId === view.me.participantId;
            return (
              <li
                key={s.participantId}
                className={`fsl-details__share${isMe ? ' fsl-details__share--me' : ''}`}
              >
                <span className="fsl-details__share-name">
                  {isMe
                    ? t('details.you', { name: nameOf(view, s.participantId) })
                    : nameOf(view, s.participantId)}
                </span>
                <Amount value={s.amount} />
              </li>
            );
          })}
        </ul>
      )}
      <ExpenseHistoryList view={view} expense={e} />

      {errorElement}

      {showReason ? (
        <div className="fsl-details__reject">
          <label htmlFor={reasonId}>{t('approvals.rejectReason')}</label>
          <input
            id={reasonId}
            className="fsl-details__input"
            value={reason}
            maxLength={140}
            onChange={(ev) => setReason(ev.target.value)}
          />
          <div className="fsl-details__reject-row">
            <Button
              variant="danger"
              disabled={!reason.trim()}
              loading={busy}
              onClick={() => run(`/expenses/${e.id}/reject`, { reason: reason.trim() })}
            >
              {t('approvals.reject')}
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : actions.length > 0 ? (
        <div className="fsl-details__actions">
          {actions.map((a) => (
            <Button
              key={a.id}
              variant={a.tone === 'success' ? 'primary' : 'secondary'}
              className={`fsl-details__action${a.tone === 'danger' ? ' fsl-details__action--danger' : ''}`}
              loading={busy}
              onClick={a.onSelect}
            >
              <Icon name={a.icon} size={18} />
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
