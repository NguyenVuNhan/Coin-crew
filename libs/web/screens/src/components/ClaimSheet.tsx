import { useState, useEffect } from 'react';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { ProviderLogo } from './ProviderLogo';
import { signInHref } from './SignInButtons';
import { browserUrl } from '../lib/openInBrowser';

export interface ClaimSheetProps {
  open: boolean;
  name: string;
  tripId: string;
  participantId: string;
  returnTo: string;
  onClose: () => void;
}

export function ClaimSheet({
  open,
  name,
  tripId,
  participantId,
  returnTo,
  onClose,
}: ClaimSheetProps) {
  const t = useT();
  const me = useMe().data;
  const zaloOff = me?.signIn?.zalo === false;
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowSteps(false);
    }
  }, [open]);

  const currentHref = typeof window !== 'undefined' && window.location ? window.location.href : '';
  const openBrowserHref = browserUrl(currentHref);

  return (
    <Sheet open={open} onClose={onClose} title={t('claim.title', { name })}>
      <div data-testid="claim-sheet" className="fsl-claim-sheet flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={name} />
          <p className="fsl-claim-sheet__body m-0 text-base text-muted-foreground text-left">
            {t('claim.body', { name })}
          </p>
        </div>

        {zaloOff ? (
          <p role="alert" className="fsl-claim-sheet__zalo-off m-0 text-sm text-danger">
            {t('claim.zaloOff')}
          </p>
        ) : (
          <Button
            variant="primary"
            block
            href={signInHref('zalo', returnTo, undefined, { tripId, participantId })}
            className="min-h-11 justify-center gap-3"
          >
            <ProviderLogo provider="zalo" size={24} />
            {t('claim.zalo')}
          </Button>
        )}

        {openBrowserHref ? (
          <Button
            variant="ghost"
            block
            href={openBrowserHref}
            className="min-h-11 justify-center"
          >
            {t('claim.openBrowser')}
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              block
              onClick={() => setShowSteps((s) => !s)}
              className="min-h-11 justify-center"
            >
              {t('claim.openBrowser')}
            </Button>
            {showSteps && (
              <p className="fsl-claim-sheet__steps m-0 text-sm text-muted-foreground text-center">
                {t('claim.browserSteps')}
              </p>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
