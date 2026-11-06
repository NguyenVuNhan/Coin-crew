import { useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from 'react';

/**
 * A card that keeps keyboard focus from falling to the page when it goes away. Acting on a card (Approve, Confirm)
 * removes it, and the focus it held would drop to <body>, so the next card is never announced. When a card is
 * removed while it held focus, it sets `handoff`, and the next card to mount with `handoff` set takes focus
 * (it is focusable by script, not by Tab). A parent whose other cards stay mounted reads `handoff` itself.
 *
 * React runs the cleanup of a layout effect while the card is still in the page and before its replacement
 * mounts, so both steps happen in the same commit. A button that turns `disabled` while its request runs can
 * already have lost focus to <body> by then, so "held focus" means focus was last seen inside this card and has not
 * been moved to another element on purpose.
 */
export function FocusWatch({
  as = 'div',
  handoff,
  className,
  children,
}: {
  as?: 'div' | 'li';
  handoff: MutableRefObject<boolean>;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const held = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && handoff.current) {
      handoff.current = false;
      el.focus();
    }
    return () => {
      const active = document.activeElement;
      if (held.current && (!active || active === document.body || el?.contains(active))) handoff.current = true;
    };
  }, [handoff]);

  const Tag = as as 'div';
  return (
    <Tag
      ref={ref}
      tabIndex={-1}
      className={className}
      onFocus={() => {
        held.current = true;
      }}
      onBlur={(e) => {
        // Focus moved to something outside the card: it is no longer ours to hand on.
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) held.current = false;
      }}
    >
      {children}
    </Tag>
  );
}
