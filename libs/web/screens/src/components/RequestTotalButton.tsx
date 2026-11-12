import type { TripView } from '@cc/core';
import { useLang, useT } from '@cc/web-i18n';
import { usePlatform } from '@cc/web-platform';
import { usePayInfo } from '@cc/web-data-access/payInfo';
import { renderLedgerPng } from '@cc/web-util/ledgerCard';
import { useQrSvg } from '@cc/web-util/qr';
import { formatDay } from '@cc/web-util/time';
import { nameOf } from '@cc/web-util/tripText';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { requestTotalRows } from '../lib/owe';
import { groupRequestText, payLink } from '../lib/remind';
import { groupRequestCard } from '../lib/shareCards';
import { useImageShare } from '../lib/useImageShare';
import { useBankFirst } from './BankFirstSheet';

/** Today as `YYYY-MM-DD` in local time. */
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * "Request payment" on the balance card (issue #93): one picture, one message and one `/owe` link for the group chat,
 * listing everyone who sends the viewer money. Each person who opens the link picks their name and gets their own QR.
 */
export function RequestTotalButton({ view }: { view: TripView }) {
  const t = useT();
  const [lang] = useLang();
  const platform = usePlatform();
  const me = view.me.participantId ?? '';
  const { guard, sheet: bankSheet } = useBankFirst(view);
  const { share, status, sharing, sheet } = useImageShare();
  // Fetched while the button is on screen, so the click never waits on the network (share sheets need the gesture).
  const { data: payInfo, isFetched } = usePayInfo({
    tripId: view.trip.id,
    toId: me,
    bill: true,
    enabled: me !== '',
    version: view.trip.version,
  });
  const qrSvg = useQrSvg(payInfo?.payload ?? null);

  const rows = requestTotalRows(view).map((s) => ({ name: nameOf(view, s.fromId), amount: s.amount }));
  const myName = nameOf(view, me);
  const bank = payInfo?.bankState === 'ok' && qrSvg ? payInfo.bank : null;

  const onShare = () => {
    const text = groupRequestText(lang, { trip: view.trip.name, creditor: myName, rows, link: payLink(view) });
    void share({
      render: () =>
        renderLedgerPng({
          title: t('request.cardTitle', { trip: view.trip.name }),
          meta: t('request.cardMeta', { date: formatDay(todayYmd()), name: myName }),
          nameHeader: t('card.name'),
          amountHeader: t('request.cardAmount'),
          rows,
          totalLabel: t('request.cardTotal'),
          total: rows.reduce((sum, r) => sum + r.amount, 0),
          ...(bank
            ? {
                qrSvg,
                bankLine: `${myName} · ${bank.bankName} · ${bank.accountNumber} · ${bank.holderName}`,
                hint: t('request.cardHint'),
              }
            : {}),
        }),
      text,
      fileName: `request-${view.trip.name.replace(/\s+/g, '-')}.png`,
      card: groupRequestCard(view, text, platform.apiBase),
      pcPicture: true,
    });
  };

  return (
    <>
      <Button
        variant="primary"
        block
        loading={sharing}
        onClick={() => guard(onShare)}
        className="fsl-balance__request mt-3 min-h-11"
        data-qr-ready={String(isFetched)}
      >
        <Icon name="share" size={18} />
        {t('request.button')}
      </Button>
      {status !== null && (
        <p
          className={
            status === 'failed'
              ? 'fsl-balance__request-status m-0 mt-2 text-sm text-danger'
              : 'fsl-balance__request-status m-0 mt-2 text-sm text-foreground'
          }
          role={status === 'failed' ? 'alert' : 'status'}
        >
          {t(status === 'copied' ? 'request.copied' : status === 'saved' ? 'pay.shareSaved' : 'pay.shareFailed')}
        </p>
      )}
      {bankSheet}
      {sheet}
    </>
  );
}
