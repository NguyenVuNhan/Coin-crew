import type { AttendancePerson } from '@cc/core';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Pill } from '@cc/web-ui/components/Pill';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Button } from '@cc/web-ui/components/Button';
import { useTrip } from '../lib/tripBase';

export interface TurnoutSheetRow {
  participantId: string;
  name: string;
  avatarUrl?: string | null;
  person: AttendancePerson | undefined;
}

export function TurnoutSheet({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: TurnoutSheetRow[] }) {
  const t = useT();
  const { href } = useTrip();
  return (
    <Sheet open={open} onClose={onClose} title={t('turnout.title')}>
      <div className="flex flex-col gap-3">
        <ul className="fsl-turnout-sheet flex flex-col" data-testid="turnout-sheet">
          {rows.map(({ participantId, name, avatarUrl, person }) => (
            <li
              key={participantId}
              className="fsl-turnout-sheet__row flex flex-col gap-1 py-2 border-b border-border last:border-b-0"
              data-testid={`turnout-row-${participantId}`}
            >
              <div className="flex items-center gap-3 min-h-11">
                <Avatar name={name} avatarUrl={avatarUrl} size="sm" />
                <span className="flex-1 min-w-0 truncate text-base font-semibold text-foreground">{name}</span>
              </div>
              {person && (
                <div className="flex flex-wrap items-center gap-1.5 pl-11">
                  {person.labels.map((l) => (
                    <Pill key={l} tone={l === 'flaky' || l === 'new' ? 'neutral' : 'accent'}>
                      {t(`attendance.label.${l}` as MessageKey)}
                    </Pill>
                  ))}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('turnout.presence')} {Math.round(person.score.presence)} · {t('turnout.reliability')}{' '}
                    {Math.round(person.score.reliability)} · {t('turnout.guest')} {person.score.guest.toFixed(1)}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Button variant="secondary" block href={href('/awards')} data-testid="turnout-awards-link">
          {t('awards.entry')}
        </Button>
      </div>
    </Sheet>
  );
}
