import { useMe } from '../api/hooks';
import { isZaloWebView } from '../lib/zaloEnv';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { Button } from './Button';
import { ProviderLogo } from './ProviderLogo';
import { cn } from '@/lib/utils';

export interface SignInButtonsProps {
  returnTo: string;
  layout: 'stack' | 'inline';
  intent?: 'signin' | 'link';
  labels?: {
    google: MessageKey;
    zalo: MessageKey;
  };
}

export function signInHref(
  provider: 'google' | 'zalo',
  returnTo: string,
  intent: 'signin' | 'link' = 'signin',
): string {
  const base = `/api/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;
  return intent === 'link' ? `${base}&intent=link` : base;
}

export function SignInButtons({
  returnTo,
  layout,
  intent = 'signin',
  labels,
}: SignInButtonsProps) {
  const t = useT();
  const me = useMe();
  const inZalo = isZaloWebView();
  const zaloOn = me.data?.signIn.zalo === true;

  const googleKey = labels?.google ?? 'landing.signIn';
  const zaloKey = labels?.zalo ?? 'signIn.zalo';
  const isStack = layout === 'stack';

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
            className={cn(isStack && 'h-12 justify-start gap-3 px-4')}
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
          : 'fsl-signin--inline flex flex-row flex-wrap items-center gap-2',
      )}
    >
      <Button
        variant={isStack ? 'primary' : 'ghost'}
        block={isStack}
        href={signInHref('google', returnTo, intent)}
        className={cn(isStack && 'h-12 justify-start gap-3 px-4')}
      >
        <ProviderLogo provider="google" size={24} />
        {t(googleKey)}
      </Button>
      {zaloOn && (
        <Button
          variant={isStack ? 'secondary' : 'ghost'}
          block={isStack}
          href={signInHref('zalo', returnTo, intent)}
          className={cn(isStack && 'h-12 justify-start gap-3 px-4')}
        >
          <ProviderLogo provider="zalo" size={24} />
          {t(zaloKey)}
        </Button>
      )}
    </div>
  );
}
