import { useEffect, useState, type JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';

/** How far down (px) the page must be before the button shows: about two phone screens. */
const SHOW_AFTER = 1200;

/** Floating button that scrolls a long transactions list back to the search box. */
export function BackToTop(): JSX.Element {
  const t = useT();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div className="fsl-tx-top pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom,0px)+12px)] lg:bottom-6 z-20 mx-auto flex w-full max-w-[480px] justify-end px-4">
      <button
        type="button"
        data-testid="tx-back-to-top"
        aria-label={t('transactions.backToTop')}
        tabIndex={shown ? 0 : -1}
        aria-hidden={!shown}
        onClick={toTop}
        className={cn(
          'inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md cursor-pointer hover:bg-muted transition-[opacity,translate,background-color] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          shown ? 'pointer-events-auto opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        )}
      >
        <Icon name="chevronUp" size={20} />
      </button>
    </div>
  );
}
