import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ExpenseView, TripView } from '@fsl/core';
import { formatVnd, computeSportShares, isFundPaid } from '@fsl/core';
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
import { useQrSvg, shareSportBill, renderSportBillPng, type SportBillCardInput } from '../lib/qr';
import { isZaloWebView } from '../lib/zaloEnv';
import { useIsMousePointer } from '../lib/media';
import { copyText } from '../lib/clipboard';
import { useImageSheet } from './SaveImageSheet';
import { sportShareText, expenseLink } from '../lib/remind';
import { ExpenseHistoryList } from './ExpenseHistoryList';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const { sheet: imageSheet, show: showImage } = useImageSheet();
  const mouse = useIsMousePointer();
  const [shareStatus, setShareStatus] = useState<'saved' | 'copied' | 'failed' | null>(null);
  const reasonId = useId();

  const e = view.expenses.find(
    (x) => x.id === expenseId || x.rootId === expenseId || x.history?.some((h) => h.id === expenseId),
  );

  const { data: payInfo } = usePayInfo({
    tripId: view.trip.id,
    toId: e?.payerId ?? '',
    bill: true,
    expenseId: e ? (e.rootId ?? e.id) : undefined,
    enabled: Boolean(e?.meta?.sport),
    version: view.trip.version,
  });
  const qrSvg = useQrSvg(payInfo?.payload ?? null);

  const place = useMemo(() => new Map(view.people.map((p, i) => [p.id, i])), [view.people]);
  const shares = useMemo(() => {
    if (!e) return [];
    return [...e.shares].sort(
      (a, b) => (place.get(a.participantId) ?? view.people.length) - (place.get(b.participantId) ?? view.people.length),
    );
  }, [e, place, view.people.length]);

  const sportCalc = useMemo(() => {
    if (!e?.meta?.sport) return null;
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
    if (!sportCalc || !e) return '';
    const link = expenseLink(view, e.rootId ?? e.id);
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
  }, [sportCalc, lang, view, e]);

  if (!e) {
    return (
      <EmptyState
        icon="receipt"
        title={t('details.gone')}
        action={<Button onClick={onClose} className="rounded-full">{t('details.backToTrip')}</Button>}
      />
    );
  }

  const status = STATUS[e.status];
  const fromFund = isFundPaid(e);

  const whoText = (id: string) => (id === view.me.participantId ? t('trip.you') : nameOf(view, id));

  let errorElement = null;
  if (error instanceof ApiClientError && error.code === 'PERSON_PENDING') {
    const pendingId = [e.payerId, ...e.shares.map((s) => s.participantId)].find(
      (id) => view.people.find((p) => p.id === id)?.status === 'pending',
    );
    if (pendingId) {
      errorElement = (
        <p className="fsl-details__error text-sm text-danger m-0" role="alert">
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

  const handleShareSportBill = async () => {
    if (!sportCalc) return;
    setShareStatus(null);

    // On a PC the message goes into a group chat by pasting: copy it (its link previews the payer's QR).
    // Copy first, while the click still counts as a user gesture.
    if (mouse && !isZaloWebView()) {
      setShareStatus((await copyText(msgText)) ? 'copied' : 'failed');
      return;
    }

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

    if (isZaloWebView()) {
      showImage(() => renderSportBillPng(billInput), msgText);
      return;
    }

    setSharing(true);
    try {
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
    <article className="fsl-details flex flex-col gap-4 min-w-0">
      {imageSheet}
      <div className="fsl-details__head flex flex-row items-start justify-between gap-3">
        <h2 className="fsl-details__title text-lg font-semibold text-foreground m-0 break-words focus:outline-none" tabIndex={-1}>
          {e.description}
        </h2>
        <Pill tone={status.tone}>{t(status.label)}</Pill>
      </div>

      <Amount value={e.amount} size="xl" className="text-3xl font-bold tabular-nums" />

      {e.status === 'rejected' && e.rejectReason ? (
        <p className="fsl-details__note fsl-details__note--danger text-sm text-danger m-0">
          {t('expense.rejectedBecause', { reason: e.rejectReason })}
        </p>
      ) : null}
      {e.status === 'disabled' && e.disabledByName ? (
        <p className="fsl-details__note text-sm text-muted-foreground m-0">
          {t('expenses.disabledBy', { name: e.disabledByName })}
        </p>
      ) : null}

      <dl className="fsl-details__facts m-0 bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
        <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
          <dt className="text-sm text-muted-foreground">{t('details.date')}</dt>
          <dd className="text-sm font-medium text-foreground text-right m-0">{formatDay(e.spentOn)}</dd>
        </div>
        <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
          <dt className="text-sm text-muted-foreground">{t('details.paidBy')}</dt>
          <dd className="text-sm font-medium text-foreground text-right m-0">{fromFund ? t('fund.title') : whoText(e.payerId)}</dd>
        </div>
        <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
          <dt className="text-sm text-muted-foreground">{t('details.addedBy')}</dt>
          <dd className="text-sm font-medium text-foreground text-right m-0">
            {fromFund ? `${whoText(e.createdById)} · ${formatDay(e.spentOn)}` : whoText(e.createdById)}
          </dd>
        </div>
        {!fromFund && (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('details.split')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0">
              {e.meta?.sport
                ? splitText(e, t)
                : e.mode === 'equal'
                  ? `${t('split.tab.equal')}, ${t('trip.people', { n: e.shares.length })}`
                  : splitText(e, t)}
            </dd>
          </div>
        )}
      </dl>

      {fromFund ? (
        <p className="fsl-details__note text-sm text-muted-foreground m-0">{t('fund.expenseNote')}</p>
      ) : sportCalc ? (
        <>
          <div className="fsl-sport-table-container overflow-x-auto bg-card border border-border rounded-xl">
            <table className="fsl-sport-table w-full border-collapse text-sm text-left">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs font-semibold">
                  <th scope="col" className="p-3 border-b border-border">{t('sport.tableColName')}</th>
                  <th scope="col" className="fsl-sport-table__col--center p-3 border-b border-border text-center">{t('sport.tableColFemale')}</th>
                  <th scope="col" className="fsl-sport-table__col--center p-3 border-b border-border text-center">{t('sport.tableColMale')}</th>
                  <th scope="col" className="fsl-sport-table__col--right p-3 border-b border-border text-right">{t('sport.tableColAmount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sportCalc.participants.map((p) => {
                  const isMe = p.participantId === view.me.participantId;
                  const displayName = isMe ? t('details.you', { name: p.name }) : p.name;
                  const isFixed = p.fixedAmount !== null && p.fixedAmount !== undefined;
                  return (
                    <tr key={p.participantId} className="hover:bg-muted/50">
                      <td className="p-3 border-b border-border">
                        <span>{displayName}</span>
                        {isFixed && (
                          <span className="fsl-sport-table__fixed text-xs text-muted-foreground"> ({t('sport.fixedBadge')})</span>
                        )}
                      </td>
                      <td className="fsl-sport-table__col--center fsl-num p-3 border-b border-border text-center tabular-nums">
                        {p.femaleSlots > 0 ? p.femaleSlots : '—'}
                      </td>
                      <td className="fsl-sport-table__col--center fsl-num p-3 border-b border-border text-center tabular-nums">
                        {p.maleSlots > 0 ? p.maleSlots : '—'}
                      </td>
                      <td className="fsl-sport-table__col--right fsl-num p-3 border-b border-border text-right tabular-nums">
                        <Amount value={p.amount} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="fsl-sport-table__row--total-slots bg-warning-soft text-warning-foreground font-semibold">
                  <th scope="row" className="p-3 border-b border-border font-semibold">{t('sport.tableTotalSlots')}</th>
                  <td className="fsl-sport-table__col--center fsl-num p-3 border-b border-border text-center tabular-nums font-semibold">{sportCalc.totalFemaleSlots}</td>
                  <td className="fsl-sport-table__col--center fsl-num p-3 border-b border-border text-center tabular-nums font-semibold">{sportCalc.totalMaleSlots}</td>
                  <td className="fsl-sport-table__col--right fsl-num p-3 border-b border-border text-right tabular-nums font-semibold">
                    {sportCalc.totalFemaleSlots + sportCalc.totalMaleSlots} {t('split.mode.shares').toLowerCase()}
                  </td>
                </tr>
                <tr className="fsl-sport-table__row--costs bg-muted/60 text-foreground">
                  <th scope="row" className="p-3 border-b border-border font-semibold">{t('sport.tableCosts')}</th>
                  <td colSpan={2} className="fsl-sport-table__col--center fsl-sport-table__cost-summary p-3 border-b border-border text-center text-xs text-muted-foreground">
                    {[
                      sportCalc.court > 0 ? `${t('sport.court')}: ${formatVnd(sportCalc.court)}` : null,
                      sportCalc.shuttlecocksTotal > 0 ? `${t('sport.shuttlecocks')}: ${formatVnd(sportCalc.shuttlecocksTotal)}` : null,
                      sportCalc.extra > 0 ? `${t('sport.extra')}: ${formatVnd(sportCalc.extra)}` : null,
                    ].filter(Boolean).join(' · ')}
                  </td>
                  <td className="fsl-sport-table__col--right fsl-num p-3 border-b border-border text-right tabular-nums font-semibold">
                    <Amount value={e.amount} />
                  </td>
                </tr>
                <tr className="fsl-sport-table__row--per-slot bg-warning-soft text-warning-foreground font-semibold">
                  <th scope="row" className="p-3 border-b border-border font-semibold">{t('sport.tablePerSlot')}</th>
                  <td className="fsl-sport-table__col--center fsl-num p-3 border-b border-border text-center tabular-nums font-semibold">
                    <Amount value={sportCalc.femaleSlotRate} />
                  </td>
                  <td className="fsl-sport-table__col--center fsl-num p-3 border-b border-border text-center tabular-nums font-semibold">
                    <Amount value={sportCalc.maleSlotRate} />
                  </td>
                  <td className="fsl-sport-table__col--right p-3 border-b border-border text-right font-semibold">—</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="fsl-sport-preview-card flex flex-col gap-3 bg-card border border-border rounded-xl p-4">
            <Button
              variant="primary"
              loading={sharing}
              onClick={handleShareSportBill}
              className="rounded-full"
            >
              <Icon name="share" size={18} />
              {t('sport.shareBillQr')}
            </Button>
            {shareStatus === 'saved' && (
              <p className="fsl-sport-share-status text-sm text-primary m-0" role="status">
                {t('pay.shareSaved')}
              </p>
            )}
            {shareStatus === 'copied' && (
              <p className="fsl-sport-share-status text-sm text-primary m-0" role="status">
                {t('sport.shareCopied')}
              </p>
            )}
            {shareStatus === 'failed' && (
              <p className="fsl-sport-share-status fsl-sport-share-status--danger text-sm text-danger m-0" role="alert">
                {t('pay.shareFailed')}
              </p>
            )}
          </div>
        </>
      ) : (
        <ul className="fsl-details__shares m-0 p-0 list-none bg-card rounded-xl border border-border divide-y divide-border overflow-hidden" aria-label={t('details.split')}>
          {shares.map((s) => {
            const isMe = s.participantId === view.me.participantId;
            return (
              <li
                key={s.participantId}
                className={cn(
                  'fsl-details__share flex items-center justify-between gap-3 px-4 py-3 min-h-11',
                  isMe && 'fsl-details__share--me bg-secondary/40 font-semibold',
                )}
              >
                <span className="fsl-details__share-name text-sm text-foreground">
                  {isMe
                    ? t('details.you', { name: nameOf(view, s.participantId) })
                    : nameOf(view, s.participantId)}
                </span>
                {view.people.find((p) => p.id === s.participantId)?.status === 'left' && (
                  <Pill tone="neutral">{t('people.leftBadge')}</Pill>
                )}
                <Amount value={s.amount} className="font-semibold tabular-nums text-right" />
              </li>
            );
          })}
        </ul>
      )}
      <ExpenseHistoryList view={view} expense={e} />

      {errorElement}

      {showReason ? (
        <div className="fsl-details__reject flex flex-col gap-2 bg-card p-4 rounded-xl border border-border">
          <Label htmlFor={reasonId} className="text-muted-foreground">{t('approvals.rejectReason')}</Label>
          <Input
            id={reasonId}
            className="fsl-details__input bg-background"
            value={reason}
            maxLength={140}
            onChange={(ev) => setReason(ev.target.value)}
          />
          <div className="fsl-details__reject-row flex gap-2 pt-1">
            <Button
              variant="danger"
              disabled={!reason.trim()}
              loading={busy}
              onClick={() => run(`/expenses/${e.id}/reject`, { reason: reason.trim() })}
              className="rounded-full"
            >
              {t('approvals.reject')}
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)} className="rounded-full">
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : actions.length > 0 ? (
        <div className="fsl-details__actions flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a.id}
              variant={a.tone === 'success' ? 'primary' : 'secondary'}
              className={cn(
                'fsl-details__action flex-1 min-w-[140px] rounded-full',
                a.tone === 'danger' && 'fsl-details__action--danger text-danger border-border hover:bg-danger-soft hover:text-danger',
              )}
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
