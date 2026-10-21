import { useMe } from '../api/hooks';
import { isZaloWebView } from '../lib/zaloEnv';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { Button } from './Button';
import { Icon } from './icons';
import './SignInButtons.css';

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

  if (inZalo) {
    return (
      <div className={`fsl-signin fsl-signin--${layout}`}>
        {zaloOn && (
          <Button
            variant={layout === 'stack' ? 'primary' : 'secondary'}
            block
            href={signInHref('zalo', returnTo, intent)}
          >
            <Icon name="zalo" size={18} />
            {t(zaloKey)}
          </Button>
        )}
        <p className="fsl-signin__hint">{t('signIn.googleInZalo')}</p>
      </div>
    );
  }

  return (
    <div className={`fsl-signin fsl-signin--${layout}`}>
      <Button
        variant={layout === 'stack' ? 'primary' : 'ghost'}
        block={layout === 'stack'}
        href={signInHref('google', returnTo, intent)}
      >
        {t(googleKey)}
      </Button>
      {zaloOn && (
        <Button
          variant={layout === 'stack' ? 'secondary' : 'ghost'}
          block={layout === 'stack'}
          href={signInHref('zalo', returnTo, intent)}
        >
          <Icon name="zalo" size={18} />
          {t(zaloKey)}
        </Button>
      )}
    </div>
  );
}
