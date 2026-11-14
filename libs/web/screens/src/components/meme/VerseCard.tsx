import { useState, type ReactNode } from 'react';
import { useT } from '@cc/web-i18n';
import type { MemeInput } from '@cc/web-util/memeCards';
import { usePrefersReducedMotion } from '@cc/web-util/media';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';

function verseSizeClass(line6: string, line8: string): string {
  const longest = Math.max(Array.from(line6).length, Array.from(line8).length);
  if (longest <= 28) return 'text-[15px]';
  if (longest <= 33) return 'text-[14px]';
  return 'text-[13px]';
}

function renderLine8(line8: string, name: string) {
  if (!name) return line8;
  const at = line8.indexOf(name);
  if (at < 0) return line8;
  return (
    <>
      {line8.slice(0, at)}
      <em className="font-bold not-italic text-meme-verse-name">{name}</em>
      {line8.slice(at + name.length)}
    </>
  );
}

export function VerseCard({
  input,
  actions,
  replayKey = 0,
  hideActions = false,
}: {
  input: Extract<MemeInput, { kind: 'verse' }>;
  actions?: ReactNode;
  replayKey?: number;
  hideActions?: boolean;
}) {
  const t = useT();
  const reducedMotion = usePrefersReducedMotion();
  const [playKey, setPlayKey] = useState(0);

  return (
    <div className="fsl-meme-item flex flex-col items-center gap-3" data-testid="meme-card-verse">
      <div
        key={`${playKey}-${replayKey}`}
        className="fsl-meme-card fsl-meme-card--verse relative mx-auto h-[480px] w-[270px] overflow-hidden rounded-xl bg-meme-verse-bg px-[22px] py-[26px] font-sans text-meme-verse-ink shadow-lg"
      >
        <div
          className="pointer-events-none absolute inset-[10px] rounded-[14px] border border-meme-verse-frame"
          aria-hidden="true"
        >
          <div className="pointer-events-none absolute inset-[5px] rounded-[10px] border border-meme-verse-frame-inner" />
        </div>
        <div className="relative text-center font-meme-serif text-xl leading-[1.2] font-bold">
          {input.heading}
          <i className="mt-1 block text-[13px] font-medium text-meme-verse-month">{input.month}</i>
        </div>
        <div className="relative mt-[18px] flex flex-col gap-3.5">
          {input.verses.slice(0, 3).map((v, idx) => (
            <div
              key={idx}
              data-testid="verse-stanza"
              className={cn('font-meme-serif leading-[1.45] italic', verseSizeClass(v.line6, v.line8))}
            >
              <span
                style={!reducedMotion ? { animationDelay: `${150 + idx * 350}ms` } : undefined}
                className={cn(
                  'block truncate pl-0',
                  !reducedMotion &&
                    'animate-[fsl-meme-ink_550ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none',
                )}
              >
                {v.line6}
              </span>
              <span
                style={!reducedMotion ? { animationDelay: `${320 + idx * 350}ms` } : undefined}
                className={cn(
                  'block truncate pl-0',
                  !reducedMotion &&
                    'animate-[fsl-meme-ink_550ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none',
                )}
              >
                {renderLine8(v.line8, v.name)}
              </span>
              <small className="mt-0.5 block truncate pl-0 font-sans text-xs tracking-[0.06em] not-italic text-meme-verse-tag">
                — {v.tag}
              </small>
            </div>
          ))}
        </div>
        <div
          className={cn(
            'absolute right-[22px] bottom-10 grid size-[46px] -rotate-6 place-items-center rounded-sm bg-meme-verse-seal text-center font-meme-serif text-[13px] leading-[1.05] font-bold text-meme-verse-bg',
            !reducedMotion &&
              'animate-[fsl-meme-seal_400ms_cubic-bezier(0.2,1.5,0.4,1)_2000ms_both] motion-reduce:animate-none',
          )}
        >
          {input.seal}
        </div>
        <div className="absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold tracking-[0.04em] text-meme-verse-month">
          {input.footer}
        </div>
      </div>
      {!hideActions && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="ghost"
            data-testid="replay-verse"
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
