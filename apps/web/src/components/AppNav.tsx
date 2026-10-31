import type { JSX } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { Icon, type IconName } from './icons';
import { Button } from './Button';
import { AccountMenu } from './AccountMenu';
import { cn } from '@/lib/utils';

export type NavSection = 'home' | 'groups' | 'activity';

export interface AppNavProps {
  section: NavSection;
  addHref: string;
}

interface NavItem {
  id: NavSection;
  labelKey: 'nav.home' | 'nav.groups' | 'nav.activity';
  href: string;
  icon: IconName;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', labelKey: 'nav.home', href: '/trips', icon: 'home' },
  { id: 'groups', labelKey: 'nav.groups', href: '/groups', icon: 'users' },
  { id: 'activity', labelKey: 'nav.activity', href: '/activity', icon: 'clock' },
] as const;

export function AppNav({ section, addHref }: AppNavProps): JSX.Element {
  const t = useT();

  return (
    <nav
      aria-label={t('nav.label')}
      data-testid="app-nav"
      className="fsl-app-nav lg:shrink-0"
    >
      {/* Phone floating footer (below lg) */}
      <div
        data-testid="app-nav-bar"
        className="fsl-app-nav__bar lg:hidden fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] inset-x-4 z-20 flex items-center justify-between pointer-events-none"
      >
        <div className="pointer-events-auto flex items-center rounded-full bg-card shadow-lg p-1.5 border border-border">
          {NAV_ITEMS.map((item) => {
            const isCurrent = section === item.id;
            return (
              <Link
                key={item.id}
                to={item.href}
                data-testid={`nav-${item.id}`}
                aria-label={t(item.labelKey)}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'size-11 rounded-full inline-flex items-center justify-center transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon name={item.icon} size={22} />
              </Link>
            );
          })}
        </div>

        <Link
          to={addHref}
          data-testid="nav-add"
          aria-label={t('nav.add')}
          className="pointer-events-auto size-14 rounded-full bg-foreground text-background shadow-lg inline-flex items-center justify-center text-3xl font-light hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity shrink-0 leading-none select-none"
        >
          +
        </Link>
      </div>

      {/* Computer side panel (from lg) */}
      <aside
        data-testid="app-nav-side"
        className="fsl-app-nav__side hidden lg:flex flex-col w-60 h-screen sticky top-0 bg-card border-r border-border p-4 gap-2 shrink-0 select-none"
      >
        <div className="font-semibold text-lg text-foreground px-3 py-2">
          CoinCrew
        </div>

        <Button
          variant="primary"
          block
          href={addHref}
          data-testid="nav-add"
          className="mb-2"
        >
          + {t('nav.add')}
        </Button>

        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isCurrent = section === item.id;
            return (
              <Link
                key={item.id}
                to={item.href}
                data-testid={`nav-${item.id}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'min-h-11 rounded-full flex items-center gap-3 px-4 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent
                    ? 'bg-secondary text-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon name={item.icon} size={20} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-2">
          <AccountMenu />
        </div>
      </aside>
    </nav>
  );
}
