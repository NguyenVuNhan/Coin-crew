import { Link } from 'react-router';
import type { TripView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { useTrip } from '../lib/tripBase';

export function PeopleEntry({ view }: { view: TripView }) {
  const t = useT();
  const { href } = useTrip(view.trip.id);

  if (view.me.kind === 'viewer') {
    return null;
  }

  const people = view.people.filter((p) => p.status !== 'left');
  const count = people.length;
  const shown = people.slice(0, 4);

  return (
    <Link
      to={href('/people')}
      aria-label={t('member.peopleEntry', { count })}
      className={cn(
        'fsl-member__people flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 text-foreground no-underline transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
      )}
    >
      <div className="fsl-member__people-avatars flex shrink-0 items-center" aria-hidden="true">
        {shown.map((person, index) => (
          <Avatar
            key={person.id}
            name={person.name}
            avatarUrl={person.avatarUrl}
            size="sm"
            className={index > 0 ? '-ml-2 ring-2 ring-card' : undefined}
          />
        ))}
      </div>
      <span className="fsl-member__people-count min-w-0 flex-1 truncate text-base font-semibold text-foreground">
        {t('member.peopleCount', { count })}
      </span>
      <Icon name="chevronRight" size={20} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}
