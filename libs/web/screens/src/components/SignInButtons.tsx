import { useMe } from '@cc/web-data-access/hooks';
import { isZaloWebView } from '@cc/web-util/zaloEnv';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { Button } from '@cc/web-ui/components/Button';
import { ProviderLogo } from './ProviderLogo';
import { ZaloSignIn } from './ZaloSignIn';
import { usePlatform } from '@cc/web-platform';
import { cn } from '@cc/web-ui/lib/utils';

export interface SignInButtonsProps {
  returnTo: string;
  layout: 'stack' | 'inline';
  intent?: 'signin' | 'link' | 'claim';
  labels?: {
    google: MessageKey;
    zalo: MessageKey;
  };
}

export function signInHref(
  provider: 'google' | 'zalo',
  returnTo: string,
  intent: 'signin' | 'link' | 'claim' = 'signin',
  claim?: { tripId: string; participantId: string },
): string {
  const base = `/api/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;
  if (claim) {
    return `${base}&intent=claim&trip=${encodeURIComponent(claim.tripId)}&pid=${encodeURIComponent(claim.participantId)}`;
  }
  if (intent === 'link') {
    return `${base}&intent=link`;
  }
  if (intent === 'claim') {
    return `${base}&intent=claim`;
  }
  return base;
}

// Inline buttons sit in a wrapping row: let them shrink to the row and wrap a long label onto a second line
// instead of forcing the page wider (the Vietnamese guest sign-in copy is ~420px on one line).
// `text-balance` splits a two-line label evenly instead of leaving one word on the second line.
const INLINE_BTN = 'h-auto min-h-11 min-w-0 max-w-full shrink whitespace-normal text-balance py-2 text-left';
// Unfilled (ghost) inline links: their row is pulled out by the same 12px (`-mx-3` below), so the logos line up with
// the text above and the hover fill bleeds into the gutter.
const INLINE_GHOST = cn(INLINE_BTN, 'px-3');

export function SignInButtons({
  returnTo,
  layout,
  intent = 'signin',
  labels,
}: SignInButtonsProps) {
  const t = useT();
  const me = useMe();
  const platform = usePlatform();
  const inZalo = isZaloWebView();
  const zaloOn = me.data?.signIn.zalo === true;

  const googleKey = labels?.google ?? 'landing.signIn';
  const zaloKey = labels?.zalo ?? 'signIn.zalo';
  const isStack = layout === 'stack';

  if (platform.kind === 'zmp') {
    return <ZaloSignIn />;
  }

  if (inZalo) {
    return (
      <div
        className={cn(
          'fsl-signin',
          isStack
            ? 'fsl-signin--stack flex flex-col gap-3'
            : 'fsl-signin--inline flex flex-row flex-wrap items-center gap-2',
        )}
      >
        {zaloOn && (
          <Button
            variant={isStack ? 'primary' : 'secondary'}
            block={isStack}
            href={signInHref('zalo', returnTo, intent)}
            className={cn(isStack ? 'h-12 justify-start gap-3 px-4' : INLINE_BTN)}
          >
            <ProviderLogo provider="zalo" size={24} />
            {t(zaloKey)}
          </Button>
        )}
        <p className="fsl-signin__hint text-sm text-muted-foreground leading-normal m-0">{t('signIn.googleInZalo')}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'fsl-signin',
        isStack
          ? 'fsl-signin--stack flex flex-col gap-3'
          : 'fsl-signin--inline flex flex-row flex-wrap items-center gap-2 -mx-3',
      )}
    >
      <Button
        variant={isStack ? 'primary' : 'ghost'}
        block={isStack}
        href={signInHref('google', returnTo, intent)}
        className={cn(isStack ? 'h-12 justify-start gap-3 px-4' : INLINE_GHOST)}
      >
        <ProviderLogo provider="google" size={24} />
        {t(googleKey)}
      </Button>
      {zaloOn && (
        <Button
          variant={isStack ? 'secondary' : 'ghost'}
          block={isStack}
          href={signInHref('zalo', returnTo, intent)}
          className={cn(isStack ? 'h-12 justify-start gap-3 px-4' : INLINE_GHOST)}
        >
          <ProviderLogo provider="zalo" size={24} />
          {t(zaloKey)}
        </Button>
      )}
    </div>
  );
}
