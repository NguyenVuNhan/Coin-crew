import { formatVnd, isFundPaid, roundToThousand, type ExpenseView, type TripView } from '@cc/core';
import { useLang, useT } from '@cc/web-i18n';
import { usePlatform } from '@cc/web-platform';
import { usePayInfo } from '@cc/web-data-access/payInfo';
import { renderLedgerPng } from '@cc/web-util/ledgerCard';
import { useQrSvg } from '@cc/web-util/qr';
import { formatDay } from '@cc/web-util/time';
import { nameOf } from '@cc/web-util/tripText';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { expenseBillText, expenseLink } from '../lib/remind';
import { expenseBillCard } from '../lib/shareCards';
import { useImageShare } from '../lib/useImageShare';
import { useBankFirst } from './BankFirstSheet';

/** Only the payer shares a normal, approved expense's bill: not a sport bill (it has its own), a fund-paid one, or on an archived group. */
export function canShareExpenseBill(view: TripView, e: ExpenseView): boolean {
  return (
    view.me.participantId !== null &&
    e.payerId === view.me.participantId &&
    e.status === 'approved' &&
    !isFundPaid(e) &&
    !view.trip.archived &&
    !e.meta?.sport
  );
}

/** "Share bill & QR" for one normal expense (issue #93): the bill picture with the payer's QR, and a link to the pay view. */
export function ExpenseBillShare({ view, expense: e }: { view: TripView; expense: ExpenseView }) {
  const t = useT();
  const [lang] = useLang();
  const platform = usePlatform();
  const { guard, sheet: bankSheet } = useBankFirst(view);
  const { share, status, sharing, sheet } = useImageShare();
  const rootId = e.rootId ?? e.id;
  const { data: payInfo, isFetched } = usePayInfo({
    tripId: view.trip.id,
    toId: e.payerId,
    bill: true,
    expenseId: rootId,
    enabled: true,
    version: view.trip.version,
  });
  const qrSvg = useQrSvg(payInfo?.payload ?? null);

  const place = new Map(view.people.map((p, i) => [p.id, i]));
  const round = view.trip.roundTransfers ? roundToThousand : (v: number) => v;
  const shares = [...e.shares]
    .sort((a, b) => (place.get(a.participantId) ?? view.people.length) - (place.get(b.participantId) ?? view.people.length))
    .map((s) => ({ id: s.participantId, name: nameOf(view, s.participantId), amount: round(s.amount) }));
  const payerName = nameOf(view, e.payerId);
  const bank = payInfo?.bankState === 'ok' && qrSvg ? payInfo.bank : null;

  const onShare = () => {
    const text = expenseBillText(lang, {
      description: e.description,
      total: e.amount,
      shares: shares.filter((s) => s.id !== e.payerId),
      link: expenseLink(view, rootId),
    });
    const refCode = payInfo?.refCode || e.description;
    void share({
      render: () =>
        renderLedgerPng({
          title: e.description,
          meta: t('bill.cardMeta', { date: formatDay(e.spentOn), trip: view.trip.name, name: payerName }),
          nameHeader: t('card.name'),
          amountHeader: t('bill.cardAmount'),
          rows: shares.map((s) =>
            s.id === e.payerId ? { name: s.name, amount: s.amount, muted: true, tag: t('bill.payerTag') } : { name: s.name, amount: s.amount },
          ),
          totalLabel: t('bill.cardTotal'),
          total: e.amount,
          ...(bank
            ? {
                qrSvg,
                bankLine: `${payerName} · ${bank.bankName} · ${bank.accountNumber} · ${bank.holderName}`,
                hint:
                  (payInfo?.amount ?? 0) > 0
                    ? t('bill.hintEqual', { amount: formatVnd(payInfo!.amount) })
                    : t('bill.hintUneven'),
              }
            : {}),
        }),
      text,
      fileName: `bill-${refCode.replace(/\s+/g, '-')}.png`,
      card: expenseBillCard(view, rootId, text, platform.apiBase),
      pcPicture: true,
    });
  };

  return (
    <div className="fsl-expense-share flex flex-col gap-3 bg-card border border-border rounded-xl p-4">
      <Button
        variant="primary"
        loading={sharing}
        onClick={() => guard(onShare)}
        className="rounded-full min-h-11"
        data-qr-ready={String(isFetched)}
      >
        <Icon name="share" size={18} />
        {t('bill.button')}
      </Button>
      {status !== null && (
        <p
          className={
            status === 'failed'
              ? 'fsl-expense-share__status text-sm text-danger m-0'
              : 'fsl-expense-share__status text-sm text-primary m-0'
          }
          role={status === 'failed' ? 'alert' : 'status'}
        >
          {t(status === 'copied' ? 'request.copied' : status === 'saved' ? 'pay.shareSaved' : 'pay.shareFailed')}
        </p>
      )}
      {bankSheet}
      {sheet}
    </div>
  );
}
