import { useState, type JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { usePlatform } from '@cc/web-platform';
import { installStore } from '@cc/web-platform/install';
import { pushStore, usePushState } from '@cc/web-platform/push';
import { useMe } from '@cc/web-data-access/hooks';
import { usePushDevice, usePushKey } from '@cc/web-data-access/push';
import { useInstallVisibility } from './InstallPill';
import { PushAskSheet } from './PushAskSheet';

export function PushPill(): JSX.Element | null {
  const t = useT();
  const platform = usePlatform();
  const me = useMe();
  const signedIn = me.isSuccess && !!me.data.user;
  const { pill: installPillVisible } = useInstallVisibility();
  const pushState = usePushState();
  const keyQuery = usePushKey();
  const hasServerKey = typeof keyQuery.data === 'string';
  const isWeb = platform.kind === 'web';
  const deviceQuery = usePushDevice(
    isWeb && signedIn && pushState === 'granted' && hasServerKey,
  );
  const [dismissed, setDismissed] = useState(() => pushStore.isDismissed());
  const [open, setOpen] = useState(false);

  const needsEnable =
    pushState === 'not-asked' ||
    (pushState === 'granted' && deviceQuery.isSuccess && deviceQuery.data === null);

  const pill =
    isWeb &&
    signedIn &&
    needsEnable &&
    hasServerKey &&
    !dismissed &&
    !pushStore.isDismissed() &&
    installStore.visits() >= 2 &&
    !installPillVisible;

  return (
    <>
      {pill && (
        <div
          data-testid="push-pill"
          className="fsl-push-pill flex min-h-11 items-center gap-2 rounded-full bg-secondary pl-4 pr-1 text-secondary-foreground"
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-11 flex-1 items-center gap-2 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="bell" size={18} />
            <span className="flex-1 text-sm font-semibold">{t('push.pill')}</span>
            <Icon name="chevronRight" size={18} />
          </button>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            onClick={() => {
              pushStore.dismiss();
              setDismissed(true);
            }}
            className="fsl-push-pill__close flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      )}
      <PushAskSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
