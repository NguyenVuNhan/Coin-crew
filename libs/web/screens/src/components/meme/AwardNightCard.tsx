import { useState, type CSSProperties, type ReactNode } from 'react';
import { useT } from '@cc/web-i18n';
import type { MemeAward, MemeInput } from '@cc/web-util/memeCards';
import { usePrefersReducedMotion } from '@cc/web-util/media';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { initialsOf } from '../../lib/awards';

/** Authored shuttlecock SVG matching the mockup's `#shuttle` symbol (`viewBox="0 0 24 32"`). */
export function ShuttlecockSvg({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 32" className={className} style={style} aria-hidden="true">
      <path d="M4 2 L12 20 L20 2 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 2 L12 20 M16 2 L12 20 M12 2 L12 20" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6.5 8 H17.5 M8.2 13 H15.8" stroke="currentColor" strokeWidth="1.1" />
      <path d="M8.5 20 H15.5 V23 A3.5 3.5 0 0 1 8.5 23 Z" fill="currentColor" />
    </svg>
  );
}

const AVATAR_TONES: Record<MemeAward['kind'], string> = {
  regular: 'bg-avatar-4 text-avatar-4-fg',
  back: 'bg-avatar-2 text-avatar-2-fg',
  guest: 'bg-avatar-1 text-avatar-1-fg',
  noShow: 'bg-avatar-3 text-avatar-3-fg',
};

const SHUTTLES = [
  { left: '30px', delay: '100ms' },
  { left: '120px', delay: '500ms' },
  { left: '210px', delay: '300ms' },
] as const;

const ROW_DELAYS = ['150ms', '300ms', '450ms', '600ms'] as const;

export function AwardNightCard({
  input,
  actions,
  replayKey = 0,
  hideActions = false,
}: {
  input: Extract<MemeInput, { kind: 'awards' }>;
  actions?: ReactNode;
  replayKey?: number;
  hideActions?: boolean;
}) {
  const t = useT();
  const reducedMotion = usePrefersReducedMotion();
  const [playKey, setPlayKey] = useState(0);

  return (
    <div className="fsl-meme-item flex flex-col items-center gap-3" data-testid="meme-card-awards">
      <div
        key={`${playKey}-${replayKey}`}
        className="fsl-meme-card fsl-meme-card--awards relative mx-auto h-[480px] w-[270px] overflow-hidden rounded-xl bg-meme-awards-bg px-4 py-5 font-sans text-meme-awards-ink shadow-lg"
      >
        <div
          className="pointer-events-none absolute -top-[40%] -inset-x-[30%] h-[70%] bg-[radial-gradient(closest-side,var(--meme-awards-glow)_0%,transparent_100%)] opacity-45"
          aria-hidden="true"
        />
        {!reducedMotion &&
          SHUTTLES.map((s, idx) => (
            <ShuttlecockSvg
              key={idx}
              style={{ left: s.left, animationDelay: s.delay }}
              className="pointer-events-none absolute -top-[30px] h-[22px] w-4 text-meme-awards-shuttle animate-[fsl-meme-fall_2.4s_cubic-bezier(0.3,0.1,0.3,1)_both] motion-reduce:animate-none"
            />
          ))}
        <div className="relative text-center">
          <small className="block text-[11px] font-semibold tracking-[0.05em] uppercase opacity-80">
            {input.subheading}
          </small>
          <b
            className={cn(
              'mt-1 block text-[26px] leading-[1.05] font-black text-balance',
              !reducedMotion &&
                'animate-[fsl-meme-aw-title_550ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none',
            )}
          >
            {input.heading}
          </b>
        </div>
        <div className="relative mt-4 flex flex-col gap-[9px]">
          {input.awards.slice(0, 4).map((award, idx) => (
            <div
              key={award.kind}
              data-testid={`award-row-${award.kind}`}
              style={!reducedMotion ? { animationDelay: ROW_DELAYS[idx] ?? '150ms' } : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg bg-meme-awards-ink px-[11px] py-[9px] text-meme-awards-name',
                !reducedMotion &&
                  'animate-[fsl-meme-aw-in_500ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none',
              )}
            >
              <span
                className={cn(
                  'grid size-[38px] shrink-0 place-items-center rounded-full text-[13px] font-bold',
                  AVATAR_TONES[award.kind],
                )}
              >
                {initialsOf(award.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-bold tracking-[0.03em] text-meme-awards-title uppercase">
                  {award.title}
                </div>
                <div className="truncate text-[15px] leading-[1.15] font-extrabold text-meme-awards-name">
                  {award.name}
                </div>
                <div
                  className={cn(
                    'truncate text-meme-awards-stat tabular-nums',
                    award.stat.length > 26 ? 'text-[11px] leading-tight' : 'text-xs',
                  )}
                >
                  {award.stat}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold tracking-[0.04em] text-meme-awards-foot">
          {input.footer}
        </div>
      </div>
      {!hideActions && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="ghost"
            data-testid="replay-awards"
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
