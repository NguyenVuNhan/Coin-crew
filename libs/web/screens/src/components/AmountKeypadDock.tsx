import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent, type RefObject } from 'react';
import type { CurrencyCode } from '@cc/core';
import { AmountKeypad } from '@cc/web-ui/components/AmountKeypad';

export interface DockedAmountKeypadProps {
  open: boolean;
  onClose(): void;
  amountAreaRef: RefObject<HTMLDivElement | null>;
  value: string;
  currency: CurrencyCode;
  onChange(next: string): void;
  onDone(minor: number): void;
  doneLabel: string;
  deleteLabel: string;
  disabled?: boolean;
  /** Bump to move focus back into the keypad (e.g. the amount was tapped again). */
  focusToken?: number;
  /** Escape closes through this when given (so the caller can return focus); else onClose. */
  onEscape?(): void;
  /** Tab from the keypad lands on the first button in this element (the category tiles), matching the visual order. */
  tabOutRef?: RefObject<HTMLElement | null>;
}

const SR_ONLY =
  'absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]';

/** One visually hidden polite live region per page; `announceSoon` debounces so fast typing reads once. */
export function useLiveAnnouncer(debounceMs = 400) {
  const [message, setMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const announce = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setMessage('');
    // Empty first, then the text on the next tick, so an identical message is read again.
    timerRef.current = setTimeout(() => setMessage(text), 50);
  }, []);

  const announceSoon = useCallback(
    (read: () => string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setMessage(read());
      }, debounceMs);
    },
    [debounceMs],
  );

  const region = (
    <div aria-live="polite" role="status" data-testid="entry-live-region" className={SR_ONLY}>
      {message}
    </div>
  );

  return { announce, announceSoon, region };
}

/** Sticky bottom AmountKeypad that closes when tapping outside both the amount area and the keypad. */
export function DockedAmountKeypad({
  open,
  onClose,
  amountAreaRef,
  value,
  currency,
  onChange,
  onDone,
  doneLabel,
  deleteLabel,
  disabled = false,
  focusToken = 0,
  onEscape,
  tabOutRef,
}: DockedAmountKeypadProps): JSX.Element | null {
  const keypadAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node) || !target.isConnected) return;
      if (amountAreaRef.current?.contains(target)) return;
      if (keypadAreaRef.current?.contains(target)) return;
      onClose();
    };
    // Attach on the next tick: the tap that opened the keypad (e.g. on a tab) is still bubbling
    // and would otherwise reach this listener and close the keypad at once.
    const timer = window.setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [open, onClose, amountAreaRef]);

  // Move focus into the keypad when it opens (or the amount is tapped again) so physical keys work at once.
  useEffect(() => {
    if (!open) return;
    keypadAreaRef.current?.querySelector<HTMLElement>('[data-testid="amount-keypad"]')?.focus();
  }, [open, focusToken]);

  if (!open) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      (onEscape ?? onClose)();
      return;
    }
    if (
      e.key === 'Tab' &&
      !e.shiftKey &&
      e.target instanceof HTMLElement &&
      e.target.dataset.testid === 'amount-keypad'
    ) {
      const first = tabOutRef?.current?.querySelector<HTMLElement>('button:not([disabled])');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      ref={keypadAreaRef}
      onKeyDown={handleKeyDown}
      className="sticky bottom-0 z-10 bg-background border-t border-border px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="mx-auto w-full max-w-[480px]">
        <fieldset disabled={disabled} className="border-0 p-0 m-0 min-w-0">
          <AmountKeypad
            value={value}
            currency={currency}
            onChange={onChange}
            onDone={onDone}
            doneLabel={doneLabel}
            deleteLabel={deleteLabel}
          />
        </fieldset>
      </div>
    </div>
  );
}
