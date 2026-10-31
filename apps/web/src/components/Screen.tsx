import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { Icon } from './icons';
import { BottomBar } from './BottomBar';
import { AppNav, type NavSection } from './AppNav';
import { useBack, useNavEntry } from '../lib/navHistory';
import { cn } from '@/lib/utils';

export interface ScreenProps {
  title: string;
  titleAlign?: 'left' | 'center';
  back?: string;
  /** Goes back by itself instead of linking to `back` (the trip details use it to return to the list in history). */
  onBack?: () => void;
  backInApp?: boolean;
  right?: ReactNode;
  bottomBar?: ReactNode;
  wide?: boolean;
  nav?: { section: NavSection; addHref: string };
  children?: ReactNode;
  className?: string;
}

interface BackLinkProps {
  to: string;
  className: string;
  label: string;
}

function BackLink({ to, className, label }: BackLinkProps) {
  const { depth } = useNavEntry();
  const { goBack } = useBack(to);
  return (
    <Link
      to={to}
      replace
      className={className}
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (depth > 0) {
          e.preventDefault();
          goBack();
        }
      }}
    >
      <Icon name="back" size={24} />
    </Link>
  );
}

interface BackInAppButtonProps {
  className: string;
  label: string;
}

function BackInAppButton({ className, label }: BackInAppButtonProps) {
  const { goBack } = useBack();
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onClick={goBack}
    >
      <Icon name="back" size={24} />
    </button>
  );
}

export function Screen({
  title,
  titleAlign = 'center',
  back,
  onBack,
  backInApp,
  right,
  bottomBar,
  wide,
  nav,
  children,
  className,
}: ScreenProps) {
  const t = useT();
  const { depth } = useNavEntry();

  const rootClass = cn(
    'fsl-screen',
    'min-h-screen min-h-dvh bg-background flex flex-col',
    nav && 'lg:flex-row',
    wide && 'fsl-screen--wide',
    bottomBar && 'fsl-screen--has-bar',
    className,
  );

  const headerClass = cn(
    'fsl-screen__header',
    'sticky top-0 h-14 bg-background border-b border-border z-20',
    titleAlign === 'left' && 'fsl-screen__header--title-left',
  );

  const backButtonClass =
    'fsl-screen__back inline-flex items-center justify-center size-11 text-foreground rounded-full bg-transparent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 transition-colors motion-reduce:transition-none cursor-pointer p-0 border-0';

  const backLinkClass =
    'fsl-screen__back inline-flex items-center justify-center size-11 text-foreground rounded-full bg-transparent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 transition-colors motion-reduce:transition-none no-underline';

  const content = (
    <>
      <header className={headerClass}>
        <div
          className={cn(
            'fsl-screen__header-inner',
            'h-full flex items-center justify-between px-4 gap-2 mx-auto w-full',
            wide ? 'max-w-[480px] lg:max-w-[1040px]' : 'max-w-[480px]',
          )}
        >
          {onBack ? (
            <button
              type="button"
              className={backButtonClass}
              aria-label={t('common.back')}
              title={t('common.back')}
              onClick={onBack}
            >
              <Icon name="back" size={24} />
            </button>
          ) : back ? (
            <BackLink to={back} className={backLinkClass} label={t('common.back')} />
          ) : backInApp && depth > 0 ? (
            <BackInAppButton className={backButtonClass} label={t('common.back')} />
          ) : (
            <div className="fsl-screen__header-spacer size-11 shrink-0" aria-hidden="true" />
          )}

          <h1
            className={cn(
              'fsl-screen__title',
              'text-lg font-semibold text-foreground flex-1 min-w-0 truncate m-0',
              titleAlign === 'left' ? 'text-left' : 'text-center',
            )}
          >
            {title}
          </h1>

          {/* From lg the account menu lives in the side panel, so the header one would be a second avatar. */}
          <div
            className={cn(
              'fsl-screen__right inline-flex items-center justify-end min-w-11 shrink-0 gap-1',
              nav && 'lg:[&_.fsl-account-menu]:hidden',
            )}
          >
            {right}
          </div>
        </div>
      </header>

      <main
        className={cn(
          'fsl-screen__content',
          'flex-1 w-full mx-auto p-4',
          wide ? 'max-w-[480px] lg:max-w-[1040px]' : 'max-w-[480px]',
          bottomBar
            ? 'pb-[calc(72px+env(safe-area-inset-bottom,0px)+1.5rem)] lg:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]'
            : 'pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]',
          nav && 'pb-[calc(7rem+env(safe-area-inset-bottom,0px))] lg:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]',
        )}
      >
        {children}
      </main>

      {bottomBar ? <BottomBar wide={wide}>{bottomBar}</BottomBar> : null}
    </>
  );

  return (
    <div className={rootClass}>
      {/* The same tree with or without the nav: it often appears once sign-in is known, and a different wrapper
          would remount the whole page (scroll, open sheets and tab state lost). */}
      {nav && <AppNav section={nav.section} addHref={nav.addHref} />}
      <div className="fsl-screen__body flex-1 flex flex-col min-w-0">{content}</div>
    </div>
  );
}
