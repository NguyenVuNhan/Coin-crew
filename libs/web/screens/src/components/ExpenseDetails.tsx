import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ExpenseView, TripView } from '@cc/core';
import { can, isFundPaid, isPlanningExpense, roundToThousand } from '@cc/core';
import { useT, useLang } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { nameOf, splitText } from '@cc/web-util/tripText';
import { formatDay } from '@cc/web-util/time';
import { useTripAction } from '../lib/useTripAction';
import { useTrip } from '../lib/tripBase';
import { actorOf, expenseActions } from '../lib/rowActions';
import { ApiClientError } from '@cc/web-data-access/client';
import { Amount } from '@cc/web-ui/components/Amount';
import { Pill, type PillProps } from '@cc/web-ui/components/Pill';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Icon } from '@cc/web-ui/components/icons';
import { usePayInfo } from '@cc/web-data-access/payInfo';
import {
  useQrSvg,
  shareSportBill,
  renderSportBillPng,
  shareSportPlanning,
  renderSportPlanningPng,
  type SportBillCardInput,
  type SportPlanningCardInput,
} from '@cc/web-util/qr';
import { isZaloWebView } from '@cc/web-util/zaloEnv';
import { useImageSheet } from './SaveImageSheet';
import { useImageShare } from '../lib/useImageShare';
import { useBankFirst } from './BankFirstSheet';
import { SportBillTable } from './SportBillTable';
import { sportShareText, sportPlanningShareText, expenseLink } from '../lib/remind';
import { sportBillCard, sportPlanningCard } from '../lib/shareCards';
import { sportBillCalc } from '../lib/sportBill';
import { usePlatform } from '@cc/web-platform';
import { ExpenseHistoryList } from './ExpenseHistoryList';
import { ExpenseBillShare, canShareExpenseBill } from './ExpenseBillShare';
import { cn } from '@cc/web-ui/lib/utils';
import { Checkbox } from '@cc/web-ui/components/ui/checkbox';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';

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
  const platform = usePlatform();
  const { base } = useTrip(view.trip.id);
  const { busy, error, run } = useTripAction(view.trip.id);
  const { guard, sheet } = useBankFirst(view);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [sharing, setSharing] = useState(false);
  const [includeProofImage, setIncludeProofImage] = useState(false);
  const { sheet: imageSheet, show: showImage } = useImageSheet();
  const billShare = useImageShare();
  const [shareStatus, setShareStatus] = useState<'saved' | 'copied' | 'failed' | null>(null);
  const reasonId = useId();
  const proofCheckboxId = useId();

  const e = view.expenses.find(
    (x) => x.id === expenseId || x.rootId === expenseId || x.history?.some((h) => h.id === expenseId),
  );
  const isPlanning = Boolean(e && isPlanningExpense(e));

  const { data: payInfo } = usePayInfo({
    tripId: view.trip.id,
    toId: e?.payerId ?? '',
    bill: true,
    expenseId: e ? (e.rootId ?? e.id) : undefined,
    enabled: Boolean(e?.meta?.sport) && !isPlanning,
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

  const sportCalc = useMemo(() => (e ? sportBillCalc(view, e) : null), [e, view]);

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
      roundTransfers: Boolean(view.trip.roundTransfers),
    });
  }, [sportCalc, lang, view, e]);

  const planningMsgText = useMemo(() => {
    if (!sportCalc || !e || !isPlanning) return '';
    const link = expenseLink(view, e.rootId ?? e.id);
    return sportPlanningShareText(lang, {
      description: e.description,
      spentOn: formatDay(e.spentOn),
      location: e.meta?.sport?.location ?? null,
      courtSlots: e.meta?.sport?.courtSlots ?? [],
      bookingCode: e.meta?.sport?.bookingCode ?? null,
      totalDuration: e.meta?.sport?.totalDuration ?? null,
      totalFemaleSlots: sportCalc.totalFemaleSlots,
      totalMaleSlots: sportCalc.totalMaleSlots,
      link,
    });
  }, [sportCalc, lang, view, e, isPlanning]);

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
    base,
    t,
    navigate,
    run,
    onReject: () => setRejecting(true),
  });
  const showReason = rejecting && e.status === 'pending';

  const handleShareSportBill = async () => {
    if (!sportCalc) return;
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
      roundTransfers: Boolean(view.trip.roundTransfers),
    };

    const refCode = payInfo?.refCode ?? e.description;
    // On a PC the message goes into a group chat by pasting: copy it only (its link previews the payer's QR).
    await billShare.share({
      render: () => renderSportBillPng(billInput),
      text: msgText,
      fileName: `bill-${(refCode || 'sport').replace(/\s+/g, '-')}.png`,
      card: sportBillCard(view, e.rootId ?? e.id, msgText, platform.apiBase),
      pcPicture: false,
      shareFile: () => shareSportBill(billInput, msgText, refCode),
    });
  };

  const canPlanSession = !view.trip.archived && can(actorOf(view), 'plan_session');
  const sportMeta = e.meta?.sport;

  const handleShareSportPlanning = async () => {
    if (!sportCalc) return;
    setShareStatus(null);

    const planningInput: SportPlanningCardInput = {
      description: e.description,
      spentOn: formatDay(e.spentOn),
      groupName: view.trip.name,
      location: sportMeta?.location ?? null,
      courtSlots: sportMeta?.courtSlots ?? [],
      bookingCode: sportMeta?.bookingCode ?? null,
      totalDuration: sportMeta?.totalDuration ?? null,
      totalMaleSlots: sportCalc.totalMaleSlots,
      totalFemaleSlots: sportCalc.totalFemaleSlots,
      rows: sportCalc.participants.map((p) => ({
        name: p.name,
        femaleSlots: p.femaleSlots,
        maleSlots: p.maleSlots,
      })),
      bookingImageDataUrl: sportMeta?.bookingImageDataUrl ?? null,
      includeProofImage,
    };

    if (platform.kind === 'zmp') {
      setSharing(true);
      try {
        const blob = await renderSportPlanningPng(planningInput);
        let saved = false;
        if (blob) {
          const fileName = `plan-${(e.description || 'sport').replace(/\s+/g, '-')}.png`;
          const saveRes = await platform.saveImage(blob, fileName);
          saved = saveRes === 'saved';
        }
        await platform.share(sportPlanningCard(view, e.rootId ?? e.id, planningMsgText, platform.apiBase));
        setShareStatus(saved ? 'saved' : 'failed');
      } catch {
        setShareStatus('failed');
      } finally {
        setSharing(false);
      }
      return;
    }

    if (isZaloWebView()) {
      showImage(() => renderSportPlanningPng(planningInput), planningMsgText);
      return;
    }

    setSharing(true);
    try {
      const res = await shareSportPlanning(planningInput, planningMsgText, e.description);
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
      {billShare.sheet}
      {sheet}
      <div className="fsl-details__head flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="fsl-details__title text-lg font-semibold text-foreground m-0 break-words focus:outline-none" tabIndex={-1}>
            {e.description}
          </h2>
          {e.note?.trim() ? (
            <p
              className="text-sm text-muted-foreground m-0 mt-1 break-words"
              data-testid="expense-note"
            >
              {e.note}
            </p>
          ) : null}
        </div>
        {isPlanning && e.status !== 'disabled' ? (
          <Pill tone="accent">{t('sport.planningBadge')}</Pill>
        ) : (
          <Pill tone={status.tone}>{t(status.label)}</Pill>
        )}
      </div>

      {isPlanning ? (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {t('sport.slotsCount', {
              count: (sportCalc?.totalFemaleSlots ?? 0) + (sportCalc?.totalMaleSlots ?? 0),
            })}
          </span>
          {sportCalc && (
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              ({t('sport.slotsBadge', { f: sportCalc.totalFemaleSlots, m: sportCalc.totalMaleSlots })})
            </span>
          )}
        </div>
      ) : (
        <Amount value={e.amount} size="xl" className="text-3xl font-bold tabular-nums" />
      )}

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
        {sportMeta?.location?.name && (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('sport.locationLabel')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0">{sportMeta.location.name}</dd>
          </div>
        )}
        {sportMeta?.location?.address && (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('sport.locationAddress')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0 flex items-center justify-end gap-2 flex-wrap">
              <span>{sportMeta.location.address}</span>
              {sportMeta.location.mapUrl && (
                <a
                  href={sportMeta.location.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(ev) => {
                    if (platform.kind === 'zmp' && sportMeta.location?.mapUrl) {
                      ev.preventDefault();
                      void platform.openExternal(sportMeta.location.mapUrl);
                    }
                  }}
                  className="inline-flex items-center min-h-11 px-2 text-primary font-semibold hover:underline"
                >
                  {t('sport.openMap')}
                </a>
              )}
            </dd>
          </div>
        )}
        {sportMeta?.location?.phone && (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('sport.locationPhone')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0">{sportMeta.location.phone}</dd>
          </div>
        )}
        {sportMeta?.courtSlots && sportMeta.courtSlots.length > 0 && (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('sport.courtSlotsLabel')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0">
              {sportMeta.courtSlots.map((c) => `${c.courtName} (${c.timeRange})`).join(' · ')}
            </dd>
          </div>
        )}
        {sportMeta?.bookingCode && (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('sport.bookingCodeFact')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0">{sportMeta.bookingCode}</dd>
          </div>
        )}
        {sportMeta?.totalDuration && (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('sport.totalDurationFact')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0">{sportMeta.totalDuration}</dd>
          </div>
        )}
        {!isPlanning && (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('details.paidBy')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0">{fromFund ? t('fund.title') : whoText(e.payerId)}</dd>
          </div>
        )}
        <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
          <dt className="text-sm text-muted-foreground">{t('details.addedBy')}</dt>
          <dd className="text-sm font-medium text-foreground text-right m-0">
            {fromFund ? `${whoText(e.createdById)} · ${formatDay(e.spentOn)}` : whoText(e.createdById)}
          </dd>
        </div>
        {!fromFund && !isPlanning && (
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
          <SportBillTable
            calc={sportCalc}
            total={isPlanning ? 0 : e.amount}
            meId={view.me.participantId}
            roundTransfers={Boolean(view.trip.roundTransfers)}
            planning={isPlanning}
          />

          {isPlanning ? (
            canPlanSession ? (
              <div className="fsl-sport-preview-card flex flex-col gap-3 bg-card border border-border rounded-xl p-4">
                {sportMeta?.bookingImageDataUrl && (
                  <div className="flex items-center gap-3 min-h-11">
                    <Checkbox
                      id={proofCheckboxId}
                      checked={includeProofImage}
                      onCheckedChange={(checked) => setIncludeProofImage(checked === true)}
                    />
                    <Label htmlFor={proofCheckboxId} className="text-sm font-medium text-foreground cursor-pointer">
                      {t('sport.includeProofImage')}
                    </Label>
                  </div>
                )}
                <Button
                  variant="primary"
                  loading={sharing}
                  onClick={() => void handleShareSportPlanning()}
                  className="rounded-full"
                >
                  <Icon name="share" size={18} />
                  {t('sport.sharePlanning')}
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
            ) : null
          ) : (
            <div className="fsl-sport-preview-card flex flex-col gap-3 bg-card border border-border rounded-xl p-4">
              <Button
                variant="primary"
                loading={billShare.sharing}
                onClick={() => (e.payerId === view.me.participantId ? guard(handleShareSportBill) : void handleShareSportBill())}
                className="rounded-full"
              >
                <Icon name="share" size={18} />
                {t('sport.shareBillQr')}
              </Button>
              {billShare.status === 'saved' && (
                <p className="fsl-sport-share-status text-sm text-primary m-0" role="status">
                  {t('pay.shareSaved')}
                </p>
              )}
              {billShare.status === 'copied' && (
                <p className="fsl-sport-share-status text-sm text-primary m-0" role="status">
                  {t('sport.shareCopied')}
                </p>
              )}
              {billShare.status === 'failed' && (
                <p className="fsl-sport-share-status fsl-sport-share-status--danger text-sm text-danger m-0" role="alert">
                  {t('pay.shareFailed')}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <ul className="fsl-details__shares m-0 p-0 list-none bg-card rounded-xl border border-border divide-y divide-border overflow-hidden" aria-label={t('details.split')}>
          {shares.map((s) => {
            const isMe = s.participantId === view.me.participantId;
            const shareVal = view.trip.roundTransfers ? roundToThousand(s.amount) : s.amount;
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
                <Amount value={shareVal} className="font-semibold tabular-nums text-right" />
              </li>
            );
          })}
        </ul>
      )}
      {!sportCalc && canShareExpenseBill(view, e) && <ExpenseBillShare view={view} expense={e} />}
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
      ) : actions.length > 0 || (isPlanning && canPlanSession && e.status !== 'disabled') ? (
        <div className="fsl-details__actions flex flex-wrap gap-2">
          {isPlanning && canPlanSession && e.status !== 'disabled' && (
            <Button
              variant="secondary"
              className="fsl-details__action flex-1 min-w-[140px] rounded-full"
              onClick={() => navigate(`${base}/expenses/${e.id}/edit?mode=complete`)}
            >
              <Icon name="check" size={18} />
              {t('sport.completeSession')}
            </Button>
          )}
          {actions.map((a) => (
            <Button
              key={a.id}
              variant={a.tone === 'success' ? 'primary' : a.tone === 'danger' ? 'ghost' : 'secondary'}
              className={cn(
                'fsl-details__action flex-1 min-w-[140px] rounded-full',
                a.tone === 'danger' && 'fsl-details__action--danger text-danger border border-danger/40 hover:bg-danger-soft hover:text-danger',
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
