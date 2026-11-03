import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatVnd,
  type PersonKey,
  type PersonWaitingSettlement,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useMe } from '../api/hooks';
import {
  confirmSettlement,
  newIdempotencyKey,
  rejectSettlement,
  renameInGroup,
  requestLink,
  setNickname,
  settle,
  unlinkPerson,
  useLedger,
  useMergeOptions,
  useProposals,
  cancelProposal,
  usePeopleSummary,
  usePersonPay,
} from '../api/people';
import { copyText } from '@cc/web-util/clipboard';
import { Screen } from '../components/Screen';
import { Button } from '@cc/web-ui/components/Button';
import { Amount } from '@cc/web-ui/components/Amount';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Icon } from '@cc/web-ui/components/icons';
import { Label } from '@cc/web-ui/components/ui/label';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { MergePicker } from '../components/MergePicker';
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { PayQr } from '../components/PayQr';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Input } from '@cc/web-ui/components/ui/input';
import { usePlatform } from '../platform';
import { requestCard } from '../lib/shareCards';
import { cn } from '@cc/web-ui/lib/utils';

export function PersonScreen(): JSX.Element {
  const { key: rawKey } = useParams<{ key: string }>();
  const key = (rawKey ? decodeURIComponent(rawKey) : '') as PersonKey;

  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const platform = usePlatform();

  const meQuery = useMe();
  const me = meQuery.data;

  const { ledger } = useLedger();
  const addHref = ledger ? `/t/${ledger.tripId}/expenses/new` : '/trips';
  const nav = { section: 'home' as const, addHref };

  const { people, isLoading, error, refetch } = usePeopleSummary();
  const person = people?.find((p) => p.key === key);

  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [nicknameValue, setNicknameValue] = useState('');
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<unknown>(null);

  const mergeOptions = useMergeOptions(key, editSheetOpen);
  const proposals = useProposals();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<{ id: string; error: unknown } | null>(null);

  const [cashSheetOpen, setCashSheetOpen] = useState(false);
  const [cashValue, setCashValue] = useState('');
  // One key per sheet open: a double tap or a retry records the payment once.
  const [cashKey, setCashKey] = useState('');
  const [cashSending, setCashSending] = useState(false);
  const [cashError, setCashError] = useState<unknown>(null);

  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [payKey, setPayKey] = useState('');
  const [paySending, setPaySending] = useState(false);
  const [payError, setPayError] = useState<unknown>(null);
  const payInfo = usePersonPay(key, paySheetOpen);

  const [answering, setAnswering] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<{ settlementId: string; error: unknown } | null>(null);

  const [mergeSheetOpen, setMergeSheetOpen] = useState(false);
  // The candidate being merged in, and the last merge's error (shown in the sheet).
  // The linked entry being split off, and the last unmerge's error (shown under its row).
  const [unmergeSending, setUnmergeSending] = useState<string | null>(null);
  const [unmergeError, setUnmergeError] = useState<{ participantId: string; error: unknown } | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    if (snack === null) return;
    const timer = setTimeout(() => {
      setSnack(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [snack]);

  if (isLoading) {
    return (
      <Screen title={person?.name ?? t('person.title')} back="/trips" nav={nav}>
        <SkeletonList rows={3} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title={person?.name ?? t('person.title')} back="/trips" nav={nav}>
        <InlineError error={error} onRetry={refetch} />
      </Screen>
    );
  }

  if (!person) {
    return (
      <Screen title={t('person.title')} back="/trips" nav={nav}>
        <EmptyState icon="users" title={t('person.notFound')} action={null} />
      </Screen>
    );
  }

  const handleOpenEdit = () => {
    setNicknameValue(person.nickname ?? '');
    setGroupNames({});
    setEditError(null);
    setEditSheetOpen(true);
  };

  const handleSaveEdit = async () => {
    if (editSaving) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const newNickname = nicknameValue.trim() || null;
      const oldNickname = person.nickname ?? null;
      if (newNickname !== oldNickname) {
        await setNickname(person.key, newNickname, qc);
      }
      if (person.userId === null && mergeOptions.data?.person?.groups) {
        for (const g of mergeOptions.data.person.groups) {
          if (g.canRename) {
            const currentVal = groupNames[g.tripId] ?? g.name;
            const trimmed = currentVal.trim();
            if (trimmed !== '' && trimmed !== g.name) {
              await renameInGroup(g.tripId, g.participantId, trimmed, qc);
            }
          }
        }
      }
      setEditSheetOpen(false);
      setSnack(t('person.saved'));
    } catch (err) {
      setEditError(err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleOpenCash = () => {
    setCashValue(String(person.total));
    setCashKey(newIdempotencyKey());
    setCashError(null);
    setCashSheetOpen(true);
  };

  const handleSaveCash = async () => {
    const cleanDigits = cashValue.replace(/\D/g, '');
    const amount = cleanDigits ? parseInt(cleanDigits, 10) : 0;
    if (amount <= 0 || cashSending) return;
    setCashSending(true);
    setCashError(null);
    try {
      await settle(person.key, amount, 'toOwner', qc, cashKey);
      setCashSheetOpen(false);
    } catch (err) {
      setCashError(err);
    } finally {
      setCashSending(false);
    }
  };

  const handleOpenMerge = () => {
    setMergeSheetOpen(true);
  };

  // Requests this user sent about this person; declined ones show once, for a week (API window).
  const myProposals = (proposals.data?.outgoing ?? []).filter(
    (p) => p.guestKey === person.key && (p.status === 'pending' || p.status === 'declined'),
  );

  const handleCancelProposal = async (id: string) => {
    if (cancelling) return;
    setCancelling(id);
    setCancelError(null);
    try {
      await cancelProposal(id, qc);
      setSnack(t('proposal.cancelled'));
    } catch (error) {
      setCancelError({ id, error });
    } finally {
      setCancelling(null);
    }
  };

  const handleMerged = (result: { key: PersonKey; proposals: string[] }) => {
    setMergeSheetOpen(false);
    setSnack(result.proposals.length > 0 ? t('merge.sent') : t('person.merged'));
    navigate(`/people/${encodeURIComponent(result.key)}`, { replace: true });
  };

  const handleUnmerge = async (participantId: string, name: string) => {
    if (unmergeSending) return;
    setUnmergeSending(participantId);
    setUnmergeError(null);
    try {
      await unlinkPerson(participantId, qc);
      setSnack(t('person.unmerged', { name }));
    } catch (error) {
      setUnmergeError({ participantId, error });
    } finally {
      setUnmergeSending(null);
    }
  };

  const handleOpenPay = () => {
    setPayKey(newIdempotencyKey());
    setPayError(null);
    setPaySheetOpen(true);
  };

  // "I've paid them": one settlement for the netted total, spread over every group (spec 6a.2).
  const handlePaidThem = async () => {
    if (person.total >= 0 || paySending) return;
    setPaySending(true);
    setPayError(null);
    try {
      await settle(person.key, -person.total, 'fromOwner', qc, payKey);
      setPaySheetOpen(false);
    } catch (err) {
      setPayError(err);
    } finally {
      setPaySending(false);
    }
  };

  const answer = async (w: PersonWaitingSettlement, action: 'confirm' | 'reject') => {
    if (answering) return;
    setAnswering(w.settlementId);
    setAnswerError(null);
    try {
      if (action === 'confirm') await confirmSettlement(w.settlementId, qc);
      else await rejectSettlement(w.settlementId, qc);
    } catch (error) {
      setAnswerError({ settlementId: w.settlementId, error });
      refetch();
    } finally {
      setAnswering(null);
    }
  };

  const handleRequestLink = async () => {
    try {
      const { url } = await requestLink(person.key);
      if (platform.kind === 'zmp') {
        const r = await platform.share(
          requestCard(url, t('person.shareTitle', { owner: me?.user?.name ?? '' })),
        );
        if (r === 'copied') {
          setSnack(t('person.linkCopied'));
        }
        return;
      }
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            url,
            title: t('person.shareTitle', { owner: me?.user?.name ?? '' }),
          });
        } catch (err: unknown) {
          if ((err as Error)?.name !== 'AbortError') {
            throw err;
          }
        }
      } else {
        await copyText(url);
        setSnack(t('person.linkCopied'));
      }
    } catch {
      // ignore
    }
  };


  const cleanCashDigits = cashValue.replace(/\D/g, '');
  const cashAmount = cleanCashDigits ? parseInt(cleanCashDigits, 10) : 0;

  return (
    <Screen title={person.name ?? t('person.title')} back="/trips" nav={nav}>
      <div className="fsl-person flex flex-col gap-6 py-2">
        {/* Header block */}
        <div className="fsl-person__header flex flex-col items-center gap-2 text-center">
          <Avatar size="xl" name={person.name} />
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center justify-center gap-1">
              <h2 className="text-xl font-semibold text-foreground m-0">{person.name}</h2>
              <Button
                variant="ghost"
                aria-label={t('person.edit')}
                data-testid="person-edit"
                className="min-h-11 min-w-11 p-0"
                onClick={handleOpenEdit}
              >
                <Icon name="edit" />
              </Button>
            </div>
            {person.nickname && (
              <span className="text-sm text-muted-foreground">"{person.nickname}"</span>
            )}
            {person.userId === null && person.groupLabel && (
              <span className="text-sm text-muted-foreground">
                {t('person.guestIn', { group: person.groupLabel })}
              </span>
            )}
          </div>
        </div>

        {/* Total block */}
        <div className="fsl-person__total flex flex-col items-center gap-1 text-center py-2">
          {person.total > 0 ? (
            <>
              <span className="text-sm font-medium text-muted-foreground">
                {t('person.owesYou')}
              </span>
              <Amount value={person.total} tone="success" size="xl" />
            </>
          ) : person.total < 0 ? (
            <>
              <span className="text-sm font-medium text-muted-foreground">
                {t('person.youOwe')}
              </span>
              <Amount value={-person.total} tone="danger" size="xl" />
            </>
          ) : (
            <span className="text-base font-semibold text-muted-foreground">
              {t('person.settled')}
            </span>
          )}
        </div>

        {/* Waiting settlements */}
        {person.waiting.length > 0 && (
          <div className="fsl-person__waiting flex flex-col gap-2">
            {person.waiting.map((w) => {
              const message =
                w.direction === 'toOwner'
                  ? t('person.saysPaid', {
                      name: person.name,
                      amount: formatVnd(w.amount),
                    })
                  : t('person.recordedFromYou', {
                      name: person.name,
                      amount: formatVnd(w.amount),
                    });
              const busy = answering === w.settlementId;
              return (
                <div
                  key={w.settlementId}
                  data-testid={`waiting-${w.settlementId}`}
                  className="flex flex-col gap-3 p-4 rounded-xl bg-card border border-border"
                >
                  <span className="text-sm text-foreground min-w-0">{message}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      loading={busy}
                      disabled={answering !== null}
                      onClick={() => void answer(w, 'confirm')}
                    >
                      {t('person.confirm')}
                    </Button>
                    <Button
                      variant="secondary"
                      data-testid={`not-received-${w.settlementId}`}
                      disabled={answering !== null}
                      onClick={() => void answer(w, 'reject')}
                    >
                      {t('person.notReceived')}
                    </Button>
                  </div>
                  {answerError?.settlementId === w.settlementId && <InlineError error={answerError.error} />}
                </div>
              );
            })}
          </div>
        )}

        {/* Items list */}
        {person.items.length > 0 && (
          <div className="fsl-person__items bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {person.items.map((item, index) => {
              // Two linked guests can sit in one trip: the trip id alone is not a unique key.
              const rowKey = `${item.tripId}:${item.otherPid ?? index}`;
              const isGroup = item.kind !== 'direct';
              const label =
                item.kind === 'direct' ? t('person.quickExpenses') : item.tripName;
              const isPositive = item.amount > 0;
              const isNegative = item.amount < 0;
              const sign = isPositive ? '+' : isNegative ? '−' : '';
              const tone = isPositive ? 'success' : isNegative ? 'danger' : 'neutral';

              const content = (
                <>
                  <span className="truncate text-base font-semibold text-foreground flex-1 min-w-0">
                    {label}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center tabular-nums font-semibold shrink-0',
                      isPositive && 'text-success',
                      isNegative && 'text-danger',
                      !isPositive && !isNegative && 'text-muted-foreground',
                    )}
                  >
                    {sign}
                    <Amount value={Math.abs(item.amount)} tone={tone} />
                  </span>
                </>
              );

              if (isGroup) {
                return (
                  <Link
                    key={rowKey}
                    to={`/t/${item.tripId}`}
                    data-testid={`person-item-${item.tripId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 min-h-11 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors"
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <div
                  key={rowKey}
                  data-testid={`person-item-${item.tripId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 min-h-11 text-foreground"
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}

        {/* Linked list ("Đã gộp vào đây") */}
        {person.linked && person.linked.length > 0 && (
          <div className="fsl-person__linked flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1 m-0">
              {t('person.linkedTitle')}
            </h3>
            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
              {person.linked.map((entry) => {
                const location =
                  entry.kind === 'direct' ? t('nav.home') : entry.tripName;
                return (
                  <div key={entry.participantId} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 min-h-11">
                      <span className="truncate text-base text-foreground flex-1 min-w-0">
                        {entry.name} · {location}
                      </span>
                      <Button
                        variant="ghost"
                        data-testid={`unmerge-${entry.participantId}`}
                        loading={unmergeSending === entry.participantId}
                        disabled={unmergeSending !== null}
                        onClick={() => void handleUnmerge(entry.participantId, entry.name)}
                      >
                        {t('person.unmerge', { name: entry.name })}
                      </Button>
                    </div>
                    {unmergeError?.participantId === entry.participantId && <InlineError error={unmergeError.error} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions stack */}
        <div className="fsl-person__actions flex flex-col gap-2">
          {person.total > 0 && (
            <>
              <Button
                variant="primary"
                block
                data-testid="person-request"
                onClick={handleRequestLink}
              >
                {t('person.request')}
              </Button>
              <Button
                variant="secondary"
                block
                data-testid="person-cash"
                onClick={handleOpenCash}
              >
                {t('person.paidInCash')}
              </Button>
            </>
          )}

          {person.total < 0 && (
            <Button
              variant="primary"
              block
              data-testid="person-settle"
              onClick={handleOpenPay}
            >
              {t('person.settleUp')}
            </Button>
          )}

          {myProposals.map((p) => {
            const group = p.tripKind === 'direct' ? t('person.quickExpenses') : p.tripName;
            if (p.status !== 'pending') {
              return (
                <p key={p.id} className="m-0 text-sm text-muted-foreground" data-testid={`proposal-declined-${p.id}`}>
                  {t('proposal.declined', { guest: p.guestName })}
                </p>
              );
            }
            const parts = p.waitingFor.map((w) =>
              w === 'user' ? (p.targetUserName ?? '') : t('proposal.theAdmin', { group }),
            );
            const who = parts.length === 2 ? t('proposal.and', { a: parts[0]!, b: parts[1]! }) : (parts[0] ?? '');
            return (
              <div key={p.id} className="flex flex-col gap-1 rounded-xl bg-warning-soft px-4 py-3" data-testid={`proposal-waiting-${p.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-warning-foreground">{t('proposal.waitingFor', { who })}</span>
                  <Button
                    variant="ghost"
                    data-testid={`proposal-cancel-${p.id}`}
                    loading={cancelling === p.id}
                    disabled={cancelling !== null}
                    onClick={() => void handleCancelProposal(p.id)}
                  >
                    {t('proposal.cancel')}
                  </Button>
                </div>
                {cancelError?.id === p.id && <InlineError error={cancelError.error} />}
              </div>
            );
          })}

          {person.userId === null && (
            <Button
              variant="secondary"
              block
              data-testid="person-merge"
              onClick={handleOpenMerge}
            >
              {t('person.mergeWith')}
            </Button>
          )}
        </div>

        {/* Edit Sheet */}
        <Sheet
          open={editSheetOpen}
          onClose={() => setEditSheetOpen(false)}
          title={t('person.edit')}
        >
          <div className="flex flex-col gap-3 py-2">
            <Input
              type="text"
              className="h-11 text-base"
              aria-label={t('person.nickname')}
              value={nicknameValue}
              onChange={(e) => setNicknameValue(e.target.value)}
            />
            <p className="text-sm text-muted-foreground m-0">
              {t('person.nicknameHelp')}
            </p>

            {person.userId === null &&
              mergeOptions.data?.person?.groups.map((g) => {
                const groupName =
                  g.kind === 'direct' ? t('person.quickExpenses') : g.tripName;
                if (g.canRename) {
                  return (
                    <div key={`${g.tripId}:${g.participantId}`} className="flex flex-col gap-1">
                    <Label htmlFor={`person-name-${g.tripId}`} className="text-foreground">
                      {t('person.nameIn', { group: groupName })}
                    </Label>
                    <Input
                      id={`person-name-${g.tripId}`}
                      type="text"
                      className="h-11 text-base"
                      aria-label={t('person.nameIn', { group: groupName })}
                      data-testid={`person-name-${g.tripId}`}
                      value={groupNames[g.tripId] ?? g.name}
                      onChange={(e) =>
                        setGroupNames((prev) => ({
                          ...prev,
                          [g.tripId]: e.target.value,
                        }))
                      }
                    />
                    </div>
                  );
                }
                return (
                  <p
                    key={`${g.tripId}:${g.participantId}`}
                    className="text-sm text-muted-foreground m-0"
                  >
                    {groupName}: {g.name}
                  </p>
                );
              })}

            {editError !== null && <InlineError error={editError} />}
            <Button
              variant="primary"
              block
              disabled={editSaving}
              loading={editSaving}
              onClick={handleSaveEdit}
            >
              {t('person.save')}
            </Button>
          </div>
        </Sheet>

        {/* Paid in Cash Sheet */}
        <Sheet
          open={cashSheetOpen}
          onClose={() => setCashSheetOpen(false)}
          title={t('person.paidInCashTitle', { name: person.name })}
        >
          <div className="flex flex-col gap-3 py-2">
            <Input
              type="text"
              inputMode="numeric"
              className="h-11 text-base"
              aria-label={t('person.amountLabel')}
              value={cashValue}
              onChange={(e) => setCashValue(e.target.value)}
            />
            {cashError !== null && <InlineError error={cashError} />}
            <Button
              variant="primary"
              block
              disabled={cashAmount <= 0 || cashSending}
              loading={cashSending}
              onClick={handleSaveCash}
            >
              {t('person.save')}
            </Button>
          </div>
        </Sheet>

        {/* Settle up Sheet: the netted total, the person's VietQR, and "I've paid them" */}
        <Sheet
          open={paySheetOpen}
          onClose={() => setPaySheetOpen(false)}
          title={t('person.payTitle', { name: person.name })}
        >
          <div className="fsl-person__pay flex flex-col gap-3 py-2" data-testid="person-pay-sheet">
            <div className="flex justify-center">
              <Amount value={Math.max(-person.total, 0)} size="xl" />
            </div>
            {payInfo.isLoading ? (
              <SkeletonList rows={1} />
            ) : payInfo.error ? (
              <InlineError error={payInfo.error} onRetry={() => void payInfo.refetch()} />
            ) : payInfo.data && payInfo.data.payload !== null && payInfo.data.amount > 0 ? (
              <PayQr info={payInfo.data} variant="pay" summary={false} />
            ) : (
              <p className="m-0 text-center text-sm text-muted-foreground" data-testid="person-pay-nobank">
                {t('person.noBank', { name: person.name })}
              </p>
            )}
            {payError !== null && <InlineError error={payError} />}
            <Button
              variant="secondary"
              block
              data-testid="person-paid-them"
              disabled={paySending || person.total >= 0}
              loading={paySending}
              onClick={handlePaidThem}
            >
              {t('person.paidThem')}
            </Button>
          </div>
        </Sheet>

        <MergePicker
          person={{ key: person.key, name: person.name }}
          open={mergeSheetOpen}
          onClose={() => setMergeSheetOpen(false)}
          onMerged={handleMerged}
        />
      </div>

      {snack !== null && <Snackbar message={snack} />}
    </Screen>
  );
}
