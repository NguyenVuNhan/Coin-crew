import { useState, type ReactNode } from 'react';
import { useT } from '@cc/web-i18n';
import type { MemeInput } from '@cc/web-util/memeCards';
import { usePrefersReducedMotion } from '@cc/web-util/media';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';

export function BoardCard({
  input,
  actions,
  replayKey = 0,
  hideActions = false,
}: {
  input: Extract<MemeInput, { kind: 'board' }>;
  actions?: ReactNode;
  replayKey?: number;
  hideActions?: boolean;
}) {
  const t = useT();
  const reducedMotion = usePrefersReducedMotion();
  const [playKey, setPlayKey] = useState(0);

  return (
    <div className="fsl-meme-item flex flex-col items-center gap-3" data-testid="meme-card-board">
      <div
        key={`${playKey}-${replayKey}`}
        className="fsl-meme-card fsl-meme-card--board relative mx-auto h-[480px] w-[270px] overflow-hidden rounded-xl bg-meme-board-bg px-3.5 py-[18px] font-sans text-meme-board-ink shadow-lg ring-1 ring-meme-story-border"
      >
        <div className="text-center font-meme-board text-[21px] leading-[1.05] text-meme-board-accent">
          {input.heading}
          <small className="mt-1 block font-sans text-[11px] font-semibold tracking-[0.06em] text-meme-board-sub uppercase">
            {input.subheading}
          </small>
        </div>
        <div className="mt-3.5 flex flex-col gap-2">
          {input.rows.slice(0, 5).map((r, idx) => {
            const digits = String(Math.min(99, Math.max(0, Math.round(r.value)))).padStart(2, '0');
            return (
              <div
                key={idx}
                className="grid grid-cols-[1fr_auto] items-center gap-1.5 rounded-[10px] bg-meme-board-row px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[11.5px] font-semibold tracking-[0.03em] text-meme-board-sub uppercase">
                    {r.label}
                  </div>
                  <div className="truncate text-sm font-extrabold">{r.name}</div>
                </div>
                <div className="flex gap-[3px]">
                  {Array.from(digits).map((d, dIdx) => (
                    <span
                      key={dIdx}
                      className={cn(
                        "relative grid h-[30px] w-[22px] place-items-center overflow-hidden rounded-[4px] bg-meme-board-flap font-meme-board text-lg tabular-nums after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-meme-board-flap after:content-['']",
                        r.tone === 'hot'
                          ? 'text-meme-board-accent'
                          : r.tone === 'cold'
                            ? 'text-meme-board-cold'
                            : 'text-meme-board-ink',
                        !reducedMotion && 'animate-[fsl-meme-flap_90ms_steps(1)_6_both] motion-reduce:animate-none',
                      )}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-[34px] flex h-[26px] items-center overflow-hidden bg-meme-board-accent px-2.5 text-xs font-extrabold whitespace-nowrap text-meme-board-flap">
          {reducedMotion ? (
            <span className="truncate">{input.ticker}</span>
          ) : (
            <span className="inline-flex shrink-0 animate-[fsl-meme-tick_10s_linear_800ms_infinite] motion-reduce:animate-none">
              <span className="pr-8">{input.ticker}</span>
              <span className="pr-8" aria-hidden="true">
                {input.ticker}
              </span>
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold tracking-[0.04em] text-meme-board-sub">
          {input.footer}
        </div>
      </div>
      {!hideActions && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="ghost"
            data-testid="replay-board"
            onClick={() => setPlayKey((k) => k + 1)}
            className="min-h-11"
          >
            <Icon name="rotateCcw" size={16} />
            <span>{t('awards.replay')}</span>
          </Button>
          {actions}
        </div>
      )}
    </div>
  );
}
