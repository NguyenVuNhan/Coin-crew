import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '../i18n';
import { usePlatform } from '../platform';
import { zaloSignIn } from '../platform/zaloSession';
import { Button } from './Button';
import { ProviderLogo } from './ProviderLogo';

/** The Mini App's only way to sign in: share the Zalo name and photo, then continue. */
export function ZaloSignIn({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'declined' | 'failed' | null>(null);
  const webUrl = platform.apiBase;
  const webLabel = webUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  async function onContinue() {
    setBusy(true);
    setResult(null);
    const outcome = await zaloSignIn(platform, queryClient);
    setBusy(false);
    if (outcome === 'signed_in') {
      onDone?.();
    } else {
      setResult(outcome);
    }
  }

  return (
    <div className="fsl-zalo-signin flex flex-col gap-3">
      <p className="fsl-zalo-signin__warning m-0 text-sm leading-normal text-muted-foreground">
        <span>{t('signIn.zaloGoogleWarning')}</span>
        {webUrl && (
          <>
            {' '}
            <a
              href={webUrl}
              className="fsl-zalo-signin__web-link font-medium text-primary underline underline-offset-2"
              onClick={(e) => {
                e.preventDefault();
                void platform.openExternal(webUrl);
              }}
            >
              {webLabel}
            </a>
          </>
        )}
      </p>
      <Button
        variant="primary"
        block
        loading={busy}
        className="fsl-zalo-signin__button h-12 justify-start gap-3 px-4"
        onClick={onContinue}
      >
        <ProviderLogo provider="zalo" size={24} />
        {t('signIn.zaloContinue')}
      </Button>
      {result && (
        <p
          role="alert"
          className={
            result === 'declined'
              ? 'fsl-zalo-signin__declined m-0 rounded-xl bg-danger-soft px-4 py-3 text-sm leading-snug text-danger'
              : 'fsl-zalo-signin__failed m-0 rounded-xl bg-danger-soft px-4 py-3 text-sm leading-snug text-danger'
          }
        >
          {result === 'declined' ? t('signIn.zaloDeclined') : t('error.generic')}
        </p>
      )}
    </div>
  );
}
