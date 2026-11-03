import { useEffect, useMemo, useState, type JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProposalView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import {
  acceptProposal,
  declineProposal,
  useProposals,
} from '../api/people';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Snackbar } from '@cc/web-ui/components/Snackbar';

interface ProposalCardProps {
  by: string;
  proposals: ProposalView[];
  onAccepted: () => void;
}

function ProposalCard({ by, proposals, onAccepted }: ProposalCardProps): JSX.Element {
  const t = useT();
  const qc = useQueryClient();
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const isBusy = sending !== null;

  const handleAccept = async (id: string) => {
    setSending(`accept-${id}`);
    setError(null);
    try {
      await acceptProposal(id, qc);
      onAccepted();
    } catch (err) {
      setError(err);
    } finally {
      setSending(null);
    }
  };

  const handleDecline = async (id: string) => {
    setSending(`decline-${id}`);
    setError(null);
    try {
      await declineProposal(id, qc);
    } catch (err) {
      setError(err);
    } finally {
      setSending(null);
    }
  };

  const handleAcceptAll = async () => {
    setSending('accept-all');
    setError(null);
    try {
      for (const p of proposals) {
        await acceptProposal(p.id, qc);
      }
      onAccepted();
    } catch (err) {
      setError(err);
    } finally {
      setSending(null);
    }
  };

  return (
    <section
      data-testid="proposal-banner"
      className="fsl-proposal-banner flex flex-col gap-3 rounded-xl bg-warning-soft p-4"
    >
      <p className="m-0 text-base font-semibold text-warning-foreground">
        {t('proposal.isThisYou', { by })}
      </p>
      {proposals.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <span className="text-sm text-foreground">
            {t('proposal.item', {
              guest: p.guestName,
              group: p.tripKind === 'direct' ? t('person.quickExpenses') : p.tripName,
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              data-testid={`proposal-accept-${p.id}`}
              disabled={isBusy}
              loading={sending === `accept-${p.id}`}
              onClick={() => handleAccept(p.id)}
            >
              {t('proposal.accept')}
            </Button>
            <Button
              variant="ghost"
              data-testid={`proposal-decline-${p.id}`}
              disabled={isBusy}
              loading={sending === `decline-${p.id}`}
              onClick={() => handleDecline(p.id)}
            >
              {t('proposal.decline')}
            </Button>
          </div>
        </div>
      ))}
      {proposals.length >= 2 && (
        <Button
          variant="secondary"
          block
          data-testid="proposal-accept-all"
          disabled={isBusy}
          loading={sending === 'accept-all'}
          onClick={handleAcceptAll}
        >
          {t('proposal.acceptAll')}
        </Button>
      )}
      {error !== null && <InlineError error={error} />}
    </section>
  );
}

export function ProposalBanner(): JSX.Element | null {
  const t = useT();
  const { data } = useProposals();
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    if (snack === null) return;
    const timer = setTimeout(() => {
      setSnack(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [snack]);

  const incoming = useMemo(
    () => (data?.incoming ?? []).filter((p) => p.status === 'pending'),
    [data?.incoming],
  );

  const groups = useMemo(() => {
    const map = new Map<string, ProposalView[]>();
    for (const p of incoming) {
      const list = map.get(p.requestedByName);
      if (list) {
        list.push(p);
      } else {
        map.set(p.requestedByName, [p]);
      }
    }
    return Array.from(map.entries());
  }, [incoming]);

  if (incoming.length === 0) {
    if (snack !== null) {
      return <Snackbar message={snack} />;
    }
    return null;
  }

  return (
    <>
      {groups.map(([by, proposals]) => (
        <ProposalCard
          key={by}
          by={by}
          proposals={proposals}
          onAccepted={() => setSnack(t('proposal.accepted'))}
        />
      ))}
      {snack !== null && <Snackbar message={snack} />}
    </>
  );
}
