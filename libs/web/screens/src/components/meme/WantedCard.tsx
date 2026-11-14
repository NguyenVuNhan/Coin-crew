import { useState, type ReactNode } from 'react';
import { useT } from '@cc/web-i18n';
import type { MemeInput } from '@cc/web-util/memeCards';
import { usePrefersReducedMotion } from '@cc/web-util/media';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { ShuttlecockSvg } from './AwardNightCard';

export function WantedCard({
  input,
  actions,
}: {
  input: Extract<MemeInput, { kind: 'wanted' }>;
  actions?: ReactNode;
}) {
  const t = useT();
  const reducedMotion = usePrefersReducedMotion();
  const [playKey, setPlayKey] = useState(0);

  const cut = input.crime.indexOf(': ');
  const crimePrefix = cut >= 0 ? input.crime.slice(0, cut + 2) : '';
  const crimeBold = cut >= 0 ? input.crime.slice(cut + 2) : input.crime;

  return (
    <div className="fsl-meme-item flex flex-col items-center gap-3" data-testid="meme-card-wanted">
      <div
        key={`${playKey}-${input.name}-${String(input.stamp)}`}
        className={cn(
          'fsl-meme-card fsl-meme-card--wanted relative mx-auto h-[480px] w-[270px] overflow-hidden rounded-xl bg-meme-wanted-bg px-[18px] py-[22px] font-sans text-meme-wanted-ink shadow-lg',
          !reducedMotion &&
            input.stamp !== null &&
            'animate-[fsl-meme-shake_250ms_linear_1620ms] motion-reduce:animate-none',
        )}
      >
        <div
          className="pointer-events-none absolute inset-2 rounded-md border-2 border-meme-wanted-border"
          aria-hidden="true"
        />
        <div className="mt-1 text-center font-meme-slab text-[50px] leading-none tracking-[0.02em]">
          {input.heading}
        </div>
        <div className="mt-1.5 truncate text-center text-xs font-bold tracking-[0.12em] uppercase">
          {input.group}
        </div>
        <div
          className={cn(
            'mx-auto mt-3.5 mb-2.5 grid size-[132px] place-items-center border-[3px] border-meme-wanted-ink bg-avatar-3 font-meme-slab text-[44px] text-avatar-3-fg sepia-[.35]',
            !reducedMotion &&
              'animate-[fsl-meme-pin_450ms_cubic-bezier(0.16,1,0.3,1)_150ms_both] motion-reduce:animate-none',
          )}
        >
          {input.initials}
        </div>
        <div className="truncate text-center font-meme-slab text-[28px] uppercase">{input.name}</div>
        <div className="mt-1.5 text-center text-[13px] leading-[1.4] tabular-nums">
          {crimePrefix}
          <b className="font-extrabold">{crimeBold}</b>
          <br />
          {input.lastSeen}
        </div>
        <div className="mx-auto mt-3 flex w-max max-w-full items-center gap-1.5 border-y-2 border-meme-wanted-ink px-2.5 py-1 text-[13px] font-extrabold">
          <ShuttlecockSvg className="h-4 w-3 shrink-0" />
          <span className="truncate">{input.reward}</span>
        </div>
        {input.stamp !== null && (
          <div
            data-testid="wanted-stamp"
            className={cn(
              'absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[14deg] rounded-[10px] border-4 border-meme-wanted-stamp bg-meme-wanted-bg/75 px-3 py-1 font-meme-slab text-[27px] whitespace-nowrap text-meme-wanted-stamp',
              !reducedMotion &&
                'animate-[fsl-meme-stamp_450ms_cubic-bezier(0.2,1.6,0.4,1)_1400ms_both] motion-reduce:animate-none',
            )}
          >
            {input.stamp}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold tracking-[0.04em] text-meme-wanted-border">
          {input.footer}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="ghost"
          data-testid="replay-wanted"
          onClick={() => setPlayKey((k) => k + 1)}
          className="min-h-11"
        >
          <Icon name="rotateCcw" size={16} />
          <span>{t('awards.replay')}</span>
        </Button>
        {actions}
      </div>
    </div>
  );
}
