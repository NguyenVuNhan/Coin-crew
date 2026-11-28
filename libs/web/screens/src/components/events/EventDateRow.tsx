import { type JSX } from "react";
import { useT } from "@cc/web-i18n";
import type { MessageKey } from "@cc/web-i18n/en";
import { Icon } from "@cc/web-ui/components/icons";
import { Input } from "@cc/web-ui/components/ui/input";
import { Label } from "@cc/web-ui/components/ui/label";
import { cn } from "@cc/web-ui/lib/utils";

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(ymd: string): Date | null {
  const m = YMD_RE.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Formats a picked `YYYY-MM-DD` date as "T2, 10/2/2027" (vi) or "Mon, 10 Feb 2027" (en). */
export function formatPickedEventDate(
  ymd: string,
  t: ReturnType<typeof useT>,
): string {
  const parsed = parseDay(ymd);
  if (!parsed) return ymd;
  return t("events.pickedDate", {
    weekday: t(`events.wd.${parsed.getDay()}` as MessageKey),
    day: parsed.getDate(),
    month: t(`entryDate.mon.${parsed.getMonth()}` as MessageKey),
    year: parsed.getFullYear(),
  });
}

export interface EventDateRowProps {
  id: string;
  label: string;
  value: string;
  /** What an empty value means, shown muted in place of a date ("Hôm nay", "Đến khi bạn dừng"). */
  emptyLabel: string;
  testId: string;
  disabled?: boolean;
  max?: string;
  allowClear?: boolean;
  onChange: (next: string) => void;
}

/**
 * One-line date row: label on the left, the date (or what an empty date means) on the right.
 * The whole row is the tap target: a transparent native date input covers it, so phones open
 * their own picker and tests can fill it. A set date gets a 44px clear button; an empty one a chevron.
 */
export function EventDateRow({
  id,
  label,
  value,
  emptyLabel,
  testId,
  disabled = false,
  max,
  allowClear = false,
  onChange,
}: EventDateRowProps): JSX.Element {
  const t = useT();
  const hasValue = YMD_RE.test(value);
  const showClear = allowClear && hasValue && !disabled;

  return (
    <div
      className={cn(
        "relative w-full min-h-12 pl-3.5 flex items-center justify-between gap-3",
        showClear ? "pr-0.5" : "pr-3",
        disabled
          ? "opacity-60"
          : "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-inset has-[input:focus-visible]:ring-ring",
      )}
    >
      <Label
        htmlFor={id}
        className="text-sm font-semibold text-foreground whitespace-nowrap shrink-0"
      >
        {label}
      </Label>

      <span className="flex items-center gap-1 min-w-0">
        <span
          data-testid={`${testId}-display`}
          className={cn(
            "text-sm tabular-nums truncate",
            hasValue
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          {hasValue ? formatPickedEventDate(value, t) : emptyLabel}
        </span>
        {!showClear && !disabled && (
          <Icon
            name="chevronRight"
            size={16}
            className="text-muted-foreground shrink-0"
          />
        )}
        {showClear && (
          <button
            type="button"
            data-testid={`${testId}-clear`}
            aria-label={t("events.clearDate")}
            onClick={() => onChange("")}
            className="relative z-10 size-11 shrink-0 inline-flex items-center justify-center rounded-full bg-transparent border-0 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </span>

      <Input
        id={id}
        type="date"
        data-testid={testId}
        disabled={disabled}
        max={max}
        aria-label={label}
        value={value}
        onClick={(e) => {
          if (disabled) return;
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* iOS opens it natively from the tap */
          }
        }}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "absolute inset-0 h-full w-full min-w-0 opacity-0 appearance-none border-0 rounded-none p-0 m-0 text-base shadow-none",
          disabled
            ? "cursor-not-allowed pointer-events-none"
            : "cursor-pointer",
        )}
      />
    </div>
  );
}
