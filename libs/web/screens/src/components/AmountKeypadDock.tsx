import { useEffect, useRef, type JSX, type RefObject } from 'react';
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

  if (!open) return null;

  return (
    <div
      ref={keypadAreaRef}
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
