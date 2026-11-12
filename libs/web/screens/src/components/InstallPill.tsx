import { useEffect, useState, useSyncExternalStore, type JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { usePlatform } from '@cc/web-platform';
import { installStore, subscribeInstall, useInstallPrompt } from '@cc/web-platform/install';
import { useMe } from '@cc/web-data-access/hooks';
import { InstallAppSheet } from './InstallAppSheet';

/** The visit is counted once per page load, however often the pill mounts. */
let visitCounted = false;
const visitListeners = new Set<() => void>();

export function __resetInstallVisitForTests(): void {
  visitCounted = false;
}

function subscribeVisits(listener: () => void): () => void {
  visitListeners.add(listener);
  const off = subscribeInstall(listener);
  return () => {
    visitListeners.delete(listener);
    off();
  };
}

/** Whether the install entry points (account-menu row, Home/Groups pill) should show. */
export function useInstallVisibility(): { pill: boolean; menuRow: boolean } {
  const platform = usePlatform();
  const me = useMe();
  const { context, mobile, installed } = useInstallPrompt();
  const signedIn = me.isSuccess && !!me.data.user;
  const dismissed = useSyncExternalStore(subscribeVisits, installStore.isDismissed, () => false);
  const visits = useSyncExternalStore(subscribeVisits, installStore.visits, () => 0);

  useEffect(() => {
    if (!signedIn || visitCounted) return;
    visitCounted = true;
    installStore.countVisit();
    visitListeners.forEach((l) => l());
  }, [signedIn]);

  const menuRow = platform.kind === 'web' && signedIn && context !== 'standalone' && !installed;
  return { menuRow, pill: menuRow && mobile && !dismissed && visits >= 2 };
}

export function InstallPill(): JSX.Element | null {
  const t = useT();
  const { pill } = useInstallVisibility();
  const [open, setOpen] = useState(false);
  return (
    <>
      {pill && (
        <div
          data-testid="install-pill"
          className="fsl-install-pill flex min-h-11 items-center gap-2 rounded-full bg-secondary pl-4 pr-1 text-secondary-foreground"
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-11 flex-1 items-center gap-2 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="smartphone" size={18} />
            <span className="flex-1 text-sm font-semibold">{t('install.pill')}</span>
            <Icon name="chevronRight" size={18} />
          </button>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            onClick={() => installStore.dismiss()}
            className="fsl-install-pill__close flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      )}
      <InstallAppSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
