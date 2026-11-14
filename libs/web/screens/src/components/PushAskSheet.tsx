import { useEffect, useState, type JSX } from 'react';
import type { PushLeadMinutes } from '@cc/core';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { usePlatform } from '@cc/web-platform';
import { usePushState } from '@cc/web-platform/push';
import { useMe } from '@cc/web-data-access/hooks';
import { useEnablePush, usePushDevice, usePushKey } from '@cc/web-data-access/push';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Snackbar } from '@cc/web-ui/components/Snackbar';

function leadMessageKey(minutes: PushLeadMinutes): MessageKey {
  switch (minutes) {
    case 15:
      return 'push.lead15';
    case 60:
      return 'push.lead60';
    case 120:
      return 'push.lead120';
    case 30:
    default:
      return 'push.lead30';
  }
}

export function PushAskSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const t = useT();
  const platform = usePlatform();
  const me = useMe();
  const signedIn = me.isSuccess && !!me.data.user;
  const pushState = usePushState();
  const keyQuery = usePushKey();
  const hasServerKey = typeof keyQuery.data === 'string';
  const deviceQuery = usePushDevice(
    platform.kind === 'web' && signedIn && pushState === 'granted' && hasServerKey,
  );
  const enableMutation = useEnablePush();
  const { reset: resetEnableMutation } = enableMutation;

  const [showError, setShowError] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);

  useEffect(() => {
    if (!showSnackbar) return undefined;
    const id = setTimeout(() => setShowSnackbar(false), 4000);
    return () => clearTimeout(id);
  }, [showSnackbar]);

  useEffect(() => {
    if (open) {
      setShowError(false);
      resetEnableMutation();
    }
  }, [open, resetEnableMutation]);

  useEffect(() => {
    if (open && pushState === 'blocked') {
      onClose();
    }
  }, [open, pushState, onClose]);

  const leadMinutes: PushLeadMinutes = deviceQuery.data?.reminderLeadMinutes ?? 30;
  const rows: { icon: IconName; title: string; desc: string }[] = [
    {
      icon: 'calendar-check',
      title: t('push.newSession'),
      desc: t('push.askNewSessionDesc'),
    },
    {
      icon: 'alarm-clock',
      title: t('push.reminder'),
      desc: t('push.reminderDesc', { lead: t(leadMessageKey(leadMinutes)) }),
    },
    {
      icon: 'receipt',
      title: t('push.expense'),
      desc: t('push.askExpenseDesc'),
    },
  ];

  async function handleEnable() {
    setShowError(false);
    const permPromise =
      typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function'
        ? Notification.requestPermission()
        : null;
    try {
      if (permPromise) {
        await permPromise;
      }
      await enableMutation.mutateAsync();
      setShowSnackbar(true);
      onClose();
    } catch (err) {
      const permission =
        typeof Notification !== 'undefined' ? Notification.permission : null;
      const denied =
        permission === 'denied' ||
        (err instanceof Error && err.message === 'Notification permission denied');
      if (denied) {
        onClose();
      } else {
        setShowError(true);
      }
    }
  }

  // While the sheet is open its modal layer hides everything outside it from screen readers.
  const snackbar = showSnackbar ? <Snackbar message={t('push.enabled')} /> : null;

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t('push.askTitle')}>
        <div data-testid="push-ask-sheet" className="fsl-push-ask flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.icon} className="fsl-push-ask__row flex items-start gap-3 py-1">
              <span className="fsl-push-ask__tile flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <Icon name={row.icon} size={20} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="m-0 text-sm font-semibold leading-snug text-foreground">{row.title}</p>
                <p className="m-0 text-sm leading-snug text-muted-foreground">{row.desc}</p>
              </div>
            </div>
          ))}
          {showError && enableMutation.error && <InlineError error={enableMutation.error} />}
          <Button
            variant="primary"
            block
            disabled={!hasServerKey || enableMutation.isPending}
            loading={enableMutation.isPending}
            onClick={handleEnable}
          >
            {t('push.enableButton')}
          </Button>
          <Button variant="ghost" block onClick={onClose}>
            {t('push.notNow')}
          </Button>
          {open && snackbar}
        </div>
      </Sheet>
      {!open && snackbar}
    </>
  );
}
