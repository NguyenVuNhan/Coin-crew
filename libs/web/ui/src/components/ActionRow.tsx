import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useSwipeReveal } from '@cc/web-util/useSwipeReveal';
import { useIsCoarsePointer, usePrefersReducedMotion } from '@cc/web-util/media';
import { Icon, type IconName } from './icons';
import { useT } from '@cc/web-i18n';
import { cn } from '../lib/utils';

const MAIN_CLASS =
  'fsl-action-row__main flex-1 min-w-0 flex items-center gap-3 px-4 py-3 min-h-11 text-left appearance-none bg-transparent border-0 m-0 font-[inherit] text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';

/** Width of one revealed action button on a phone. */
const ACTION_WIDTH = 80;

export type RowAction = {
  id: string;
  label: string;
  icon: IconName;
  tone?: 'default' | 'danger' | 'success';
  /** Optional `data-testid` for the action's button (in hover tools, swipe tray, or an ActionSheet). */
  testId?: string;
  onSelect: () => void;
};

const SWIPE_TONE: Record<'default' | 'danger' | 'success', string> = {
  default: 'bg-muted text-foreground',
  danger: 'bg-danger text-primary-foreground',
  success: 'bg-success text-primary-foreground',
};

const TOOL_TONE: Record<'default' | 'danger' | 'success', string> = {
  default: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  danger: 'text-danger hover:bg-danger-soft',
  success: 'text-success hover:bg-success-soft',
};

export function ActionRow({
  label,
  actions,
  onOpen,
  openTestId,
  selected,
  expanded,
  controls,
  leading,
  trailing,
  hintable,
  href,
  hrefTestId,
  children,
}: {
  label: string;
  actions: RowAction[];
  onOpen?: () => void;
  /** Optional `data-testid` for the main `<button>` (ignored for `href` rows). */
  openTestId?: string;
  /** For a row that goes to another page: the main area becomes an in-app link (`onOpen`, `expanded` and `controls` are ignored). */
  href?: string;
  hrefTestId?: string;
  selected?: boolean;
  /** For a row that opens its content in place instead of going elsewhere: sets `aria-expanded` on the row's button. */
  expanded?: boolean;
  /** Id of the content the row opens in place, set as `aria-controls` while it is shown. */
  controls?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  hintable?: boolean;
  children: ReactNode;
}) {
  const coarse = useIsCoarsePointer();
  const reduced = usePrefersReducedMotion();
  const t = useT();

  const swipeable = coarse && actions.length > 0;
  const width = actions.length * ACTION_WIDTH;
  const swipe = useSwipeReveal({ actionsWidth: width, disabled: !swipeable });
  const hasTrailing = Boolean(trailing);
  const trailingRef = useRef<HTMLDivElement>(null);
  const [trailingWidth, setTrailingWidth] = useState(0);

  useLayoutEffect(() => {
    if (!swipeable || !hasTrailing) {
      setTrailingWidth(0);
      return undefined;
    }
    const el = trailingRef.current;
    if (!el) return undefined;
    const measure = () => {
      const next = el.getBoundingClientRect().width;
      setTrailingWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [swipeable, hasTrailing]);

  const surfaceOffset = hasTrailing ? 0 : swipe.offset;
  const trailingHidden = swipeable && swipe.offset > 0;
  const bodySwipePad = swipeable && hasTrailing ? Math.max(0, swipe.offset - trailingWidth) : 0;

  const hoverPadClass =
    !coarse && actions.length > 0
      ? actions.length === 1
        ? 'group-hover/row:pr-20 group-focus-within/row:pr-20'
        : actions.length === 2
          ? 'group-hover/row:pr-28 group-focus-within/row:pr-28'
          : 'group-hover/row:pr-40 group-focus-within/row:pr-40'
      : undefined;

  const [hint, setHint] = useState(() => hintable === true && swipeable && !hintSeen());

  useEffect(() => {
    if (hint) {
      markHintSeen();
    }
  }, [hint]);

  const dismissHint = () => setHint(false);

  const peek = hint && !reduced && swipe.offset === 0;

  const transition = reduced
    ? undefined
    : swipe.offset > 0 && swipe.offset < width
      ? 'none'
      : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';

  const bodyPadTransition = reduced
    ? undefined
    : swipe.offset > 0 && swipe.offset < width
      ? 'none'
      : 'padding-right 200ms cubic-bezier(0.2, 0, 0, 1)';

  return (
    <div className={cn('fsl-action-row group/row relative', selected && 'fsl-action-row--selected')}>
      <div
        className={cn('fsl-action-row__stage relative overflow-hidden touch-pan-y', coarse && 'select-none')}
        data-open={swipe.open}
        {...swipe.handlers}
        onPointerDown={(e) => {
          dismissHint();
          swipe.handlers.onPointerDown?.(e);
        }}
      >
        {swipeable && (
          <div
            className={cn(
              'fsl-action-row__swipe-actions absolute inset-y-0 right-0 flex invisible data-[revealed=true]:visible',
              hasTrailing && 'z-10',
            )}
            data-revealed={swipe.offset > 0 || peek}
            style={
              hasTrailing
                ? {
                    transform: `translateX(${peek ? 0 : width - swipe.offset}px)`,
                    ...(transition !== undefined ? { transition } : {}),
                  }
                : undefined
            }
          >
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                data-testid={action.testId}
                className={cn(
                  'fsl-action-row__swipe-action',
                  `fsl-action-row__swipe-action--${action.tone ?? 'default'}`,
                  'w-[80px] min-h-11 border-0 m-0 flex flex-col items-center justify-center gap-1 font-sans text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  SWIPE_TONE[action.tone ?? 'default'],
                )}
                onClick={() => {
                  swipe.close();
                  action.onSelect();
                }}
              >
                <Icon name={action.icon} size={20} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
        <div
          className={cn(
            'fsl-action-row__surface relative flex items-center will-change-transform',
            selected ? 'bg-accent' : 'bg-card hover:bg-accent',
            peek && 'fsl-action-row__surface--peek',
          )}
          style={{
            transform: `translateX(${-surfaceOffset}px)`,
            ...(transition !== undefined ? { transition } : {}),
          }}
        >
          {leading && <div className="fsl-action-row__leading shrink-0 pl-4 flex items-center">{leading}</div>}
          <div
            className="fsl-action-row__body relative flex-1 min-w-0 flex"
            style={
              swipeable && hasTrailing
                ? {
                    paddingRight: `${bodySwipePad}px`,
                    ...(bodyPadTransition !== undefined ? { transition: bodyPadTransition } : {}),
                  }
                : undefined
            }
          >
            {href !== undefined ? (
              <Link
                to={href}
                className={cn(MAIN_CLASS, 'no-underline', hoverPadClass)}
                aria-label={label}
                aria-current={selected || undefined}
                data-testid={hrefTestId}
                onClick={(e) => {
                  // A revealed swipe only closes; it never navigates.
                  if (swipe.open) {
                    e.preventDefault();
                    swipe.close();
                  }
                }}
              >
                {children}
              </Link>
            ) : (
              <button
                type="button"
                className={cn(MAIN_CLASS, hoverPadClass)}
                aria-label={label}
                aria-current={selected || undefined}
                aria-expanded={expanded}
                aria-controls={controls}
                data-testid={openTestId}
                onClick={() => (swipe.open ? swipe.close() : onOpen?.())}
              >
                {children}
              </button>
            )}
            {!coarse && actions.length > 0 && (
              <div
                className={cn(
                  'fsl-action-row__tools',
                  'absolute top-0.5 right-0.5 bottom-0.5 flex items-center justify-end gap-1 pl-6 pr-2',
                  'bg-gradient-to-r from-transparent via-card/80 to-card group-hover/row:via-accent/80 group-hover/row:to-accent group-focus-within/row:via-card/80 group-focus-within/row:to-card',
                  'invisible pointer-events-none group-hover/row:visible group-hover/row:pointer-events-auto group-focus-within/row:visible group-focus-within/row:pointer-events-auto',
                )}
              >
                {actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    data-testid={action.testId}
                    className={cn(
                      'fsl-action-row__tool',
                      `fsl-action-row__tool--${action.tone ?? 'default'}`,
                      'size-9 inline-flex items-center justify-center rounded-lg border-0 bg-transparent p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                      TOOL_TONE[action.tone ?? 'default'],
                    )}
                    aria-label={action.label}
                    title={action.label}
                    onClick={action.onSelect}
                  >
                    <Icon name={action.icon} size={18} />
                  </button>
                ))}
              </div>
            )}
          </div>
          {trailing && (
            <div
              ref={trailingRef}
              aria-hidden={trailingHidden || undefined}
              inert={swipeable && swipe.open ? true : undefined}
              className={cn(
                'fsl-action-row__trailing shrink-0 pr-4 flex items-center',
                swipeable && !reduced && 'transition-opacity duration-200 ease-out',
                trailingHidden && 'opacity-0 pointer-events-none',
              )}
            >
              {trailing}
            </div>
          )}
        </div>
      </div>
      {hint && <p className="fsl-action-row__hint m-0 px-4 pt-1 pb-2 font-sans text-xs text-muted-foreground">{t('rows.swipeHint')}</p>}
    </div>
  );
}

function hintSeen(): boolean {
  try {
    return localStorage.getItem('fsl.swipeHintSeen') !== null;
  } catch {
    return false;
  }
}

function markHintSeen(): void {
  try {
    localStorage.setItem('fsl.swipeHintSeen', '1');
  } catch {
    // storage blocked: the hint may show again, that is fine
  }
}
