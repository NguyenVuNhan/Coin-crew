import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  findSimilarNames,
  formatVnd,
  type PersonItem,
  type PersonKey,
} from '@fsl/core';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import {
  confirmSettlement,
  linkPeople,
  requestLink,
  setNickname,
  settle,
  usePeopleSummary,
} from '../api/people';
import { copyText } from '../lib/clipboard';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Amount } from '../components/Amount';
import { Avatar } from '../components/Avatar';
import { Sheet } from '../components/Sheet';
import { Snackbar } from '../components/Snackbar';
import { InlineError } from '../components/InlineError';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function PersonScreen(): JSX.Element {
  const { key: rawKey } = useParams<{ key: string }>();
  const key = (rawKey ? decodeURIComponent(rawKey) : '') as PersonKey;

  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const meQuery = useMe();
  const me = meQuery.data;

  const { people, isLoading, error, refetch } = usePeopleSummary();
  const person = people?.find((p) => p.key === key);

  const [nicknameSheetOpen, setNicknameSheetOpen] = useState(false);
  const [nicknameValue, setNicknameValue] = useState('');

  const [cashSheetOpen, setCashSheetOpen] = useState(false);
  const [cashValue, setCashValue] = useState('');

  const [samePersonSheetOpen, setSamePersonSheetOpen] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    if (!showCopied) return;
    const timer = setTimeout(() => {
      setShowCopied(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [showCopied]);

  if (isLoading) {
    return (
      <Screen title={person?.name ?? t('person.title')} back="/trips">
        <SkeletonList rows={3} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title={person?.name ?? t('person.title')} back="/trips">
        <InlineError error={error} onRetry={refetch} />
      </Screen>
    );
  }

  if (!person) {
    return (
      <Screen title={t('person.title')} back="/trips">
        <EmptyState icon="users" title={t('person.notFound')} action={null} />
      </Screen>
    );
  }

  const handleOpenNickname = () => {
    setNicknameValue(person.nickname ?? '');
    setNicknameSheetOpen(true);
  };

  const handleSaveNickname = async () => {
    await setNickname(person.key, nicknameValue.trim() || null, qc);
    setNicknameSheetOpen(false);
  };

  const handleOpenCash = () => {
    setCashValue(String(person.total));
    setCashSheetOpen(true);
  };

  const handleSaveCash = async () => {
    const cleanDigits = cashValue.replace(/\D/g, '');
    const amount = cleanDigits ? parseInt(cleanDigits, 10) : 0;
    if (amount <= 0) return;
    await settle(person.key, amount, 'toOwner', qc);
    setCashSheetOpen(false);
  };

  const handleRequestLink = async () => {
    try {
      const { url } = await requestLink(person.key);
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
        setShowCopied(true);
      }
    } catch {
      // ignore
    }
  };

  // Item with the most negative amount that has otherPid
  const settleUpItem = person.items
    .filter((item) => Boolean(item.otherPid))
    .reduce<PersonItem | undefined>((mostNeg, item) => {
      if (!mostNeg || item.amount < mostNeg.amount) {
        return item;
      }
      return mostNeg;
    }, undefined);

  // Other people from summary with similar names (excluding this person)
  const others = (people ?? []).filter((p) => p.key !== person.key);
  const candidates = others.map((o) => ({ id: o.key, name: o.name }));
  const similarPeople = findSimilarNames(person.name, candidates);

  const cleanCashDigits = cashValue.replace(/\D/g, '');
  const cashAmount = cleanCashDigits ? parseInt(cleanCashDigits, 10) : 0;

  return (
    <Screen title={person.name ?? t('person.title')} back="/trips">
      <div className="fsl-person flex flex-col gap-6 py-2">
        {/* Header block */}
        <div className="fsl-person__header flex flex-col items-center gap-2 text-center">
          <Avatar name={person.name} />
          <div className="flex flex-col items-center gap-0.5">
            <h2 className="text-xl font-bold text-foreground m-0">{person.name}</h2>
            {person.nickname && (
              <span className="text-sm text-muted-foreground">"{person.nickname}"</span>
            )}
          </div>
          <Button variant="ghost" onClick={handleOpenNickname}>
            {t('person.editNickname')}
          </Button>
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
              return (
                <div
                  key={w.settlementId}
                  data-testid={`waiting-${w.settlementId}`}
                  className="flex items-center justify-between gap-3 p-4 rounded-xl bg-card border border-border"
                >
                  <span className="text-sm text-foreground flex-1 min-w-0">{message}</span>
                  <Button
                    variant="primary"
                    onClick={async () => {
                      await confirmSettlement(w.settlementId, qc);
                    }}
                  >
                    {t('person.confirm')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Items list */}
        {person.items.length > 0 && (
          <div className="fsl-person__items bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {person.items.map((item) => {
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
                    key={item.tripId}
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
                  key={item.tripId}
                  data-testid={`person-item-${item.tripId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 min-h-11 text-foreground"
                >
                  {content}
                </div>
              );
            })}
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
              href={
                settleUpItem
                  ? `/t/${settleUpItem.tripId}/pay/${settleUpItem.otherPid}`
                  : undefined
              }
              disabled={!settleUpItem}
            >
              {t('person.settleUp')}
            </Button>
          )}

          {person.userId === null &&
            person.items.map((item) => (
              <Button
                key={`manage-${item.tripId}`}
                variant="ghost"
                block
                href={`/t/${item.tripId}/people`}
              >
                {t('person.manageIn', {
                  group:
                    item.kind === 'direct' ? t('person.quickExpenses') : item.tripName,
                })}
              </Button>
            ))}

          {person.groupLabel !== null && (
            <Button
              variant="ghost"
              block
              data-testid="person-same"
              onClick={() => setSamePersonSheetOpen(true)}
            >
              {t('person.samePerson')}
            </Button>
          )}
        </div>

        {/* Edit Nickname Sheet */}
        <Sheet
          open={nicknameSheetOpen}
          onClose={() => setNicknameSheetOpen(false)}
          title={t('person.nickname')}
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
            <Button variant="primary" block onClick={handleSaveNickname}>
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
            <Button
              variant="primary"
              block
              disabled={cashAmount <= 0}
              onClick={handleSaveCash}
            >
              {t('person.save')}
            </Button>
          </div>
        </Sheet>

        {/* Same Person Sheet */}
        <Sheet
          open={samePersonSheetOpen}
          onClose={() => setSamePersonSheetOpen(false)}
          title={t('person.samePerson')}
        >
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground m-0">
              {t('person.samePersonHelp')}
            </p>
            <div className="flex flex-col gap-2">
              {similarPeople.map((match) => (
                <Button
                  key={match.id}
                  variant="secondary"
                  block
                  onClick={async () => {
                    const result = await linkPeople(
                      [person.key, match.id as PersonKey],
                      qc,
                    );
                    setSamePersonSheetOpen(false);
                    navigate(`/people/${encodeURIComponent(result.key)}`, {
                      replace: true,
                    });
                  }}
                >
                  {match.name}
                </Button>
              ))}
            </div>
          </div>
        </Sheet>
      </div>

      {showCopied && <Snackbar message={t('person.linkCopied')} />}
    </Screen>
  );
}
