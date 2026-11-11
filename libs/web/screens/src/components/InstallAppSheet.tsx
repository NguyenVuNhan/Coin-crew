import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { cn } from '@cc/web-ui/lib/utils';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { copyText } from '@cc/web-util/clipboard';
import { isZaloWebView } from '@cc/web-util/zaloEnv';
import { iosMajorVersion, useInstallPrompt, type InstallContext } from '@cc/web-platform/install';

export interface InstallAppSheetProps {
  open: boolean;
  onClose: () => void;
  onInstalled?: () => void;
}

interface Step {
  key: MessageKey;
  trailing?: IconName;
}

const GLYPHS: Record<string, IconName> = { '⋮': 'ellipsisVertical', '⋯': 'ellipsis' };

/** Swap the ⋮ / ⋯ glyphs in a step for the matching inline icon, and append an optional trailing icon. */
function StepText({ text, trailing }: { text: string; trailing?: IconName }) {
  const parts = text.split(/([⋮⋯])/);
  return (
    <span className="fsl-install-sheet__step-text min-w-0 flex-1 text-base leading-normal text-foreground">
      {parts.map((part, i) => {
        const icon = GLYPHS[part];
        return icon ? (
          <Icon key={i} name={icon} size={18} className="mx-1 inline-block align-text-bottom" />
        ) : (
          <span key={i}>{part}</span>
        );
      })}
      {trailing && <Icon name={trailing} size={18} className="mx-1 inline-block align-text-bottom" />}
    </span>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  const t = useT();
  return (
    <ol className="fsl-install-sheet__steps m-0 flex list-none flex-col gap-1 rounded-xl bg-card p-2">
      {steps.map((step, i) => (
        <li key={step.key} data-testid="install-step" className="fsl-install-sheet__step flex min-h-11 items-center gap-3 px-2 py-2">
          <span className="fsl-install-sheet__num flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
            {i + 1}
          </span>
          <StepText text={t(step.key)} trailing={step.trailing} />
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="fsl-install-sheet__note m-0 rounded-xl bg-secondary p-3 text-sm leading-5 text-secondary-foreground">
      {children}
    </p>
  );
}

const ANDROID_STEPS: Step[] = [{ key: 'install.androidStep1' }, { key: 'install.androidStep2' }];

export function InstallAppSheet({ open, onClose, onInstalled }: InstallAppSheetProps): JSX.Element {
  const t = useT();
  const { context: detected, mobile, prompt } = useInstallPrompt();
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (message === null) return undefined;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  useEffect(() => {
    if (open) setFallback(false);
  }, [open]);

  const fallbackContext: InstallContext = mobile ? 'android-manual' : 'desktop';
  const context: InstallContext = detected === 'prompt' && fallback ? fallbackContext : detected;

  async function installNow() {
    setBusy(true);
    try {
      const outcome = await prompt();
      if (outcome === 'accepted') {
        onInstalled?.();
        onClose();
        setMessage(t('install.installed'));
      } else {
        setFallback(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (await copyText(window.location.href)) setMessage(t('share.copied'));
  }

  const gotIt = (
    <Button variant="secondary" block onClick={onClose}>
      {t('install.gotIt')}
    </Button>
  );
  const signInNote = <Note>{t('install.iosSignInNote')}</Note>;

  let body: JSX.Element;
  switch (context) {
    case 'prompt':
      body = (
        <>
          <p className="m-0 text-base leading-normal text-muted-foreground">{t('install.promptBody')}</p>
          <Button variant="primary" block loading={busy} onClick={installNow}>
            {t('install.installNow')}
          </Button>
          <Button variant="ghost" block onClick={onClose}>
            {t('install.notNow')}
          </Button>
        </>
      );
      break;
    case 'android-manual':
      body = (
        <>
          <Steps steps={ANDROID_STEPS} />
          {gotIt}
        </>
      );
      break;
    case 'ios-safari': {
      const major = iosMajorVersion(typeof navigator === 'undefined' ? '' : navigator.userAgent);
      const modern = major === null || major >= 26;
      const steps: Step[] = modern
        ? [
            { key: 'install.iosStepMore' },
            { key: 'install.iosStepShare', trailing: 'shareIos' },
            { key: 'install.iosStepAdd', trailing: 'squarePlus' },
          ]
        : [
            { key: 'install.iosStepShareOld', trailing: 'shareIos' },
            { key: 'install.iosStepAdd', trailing: 'squarePlus' },
          ];
      body = (
        <>
          <Steps steps={steps} />
          {signInNote}
          {gotIt}
        </>
      );
      break;
    }
    case 'ios-chrome':
      body = (
        <>
          <Steps
            steps={[
              { key: 'install.iosChromeStep1', trailing: 'shareIos' },
              { key: 'install.iosChromeStep2', trailing: 'squarePlus' },
            ]}
          />
          {signInNote}
          {gotIt}
        </>
      );
      break;
    case 'ios-other':
      body = (
        <>
          <Steps steps={[{ key: 'install.iosOtherStep' }]} />
          {signInNote}
          {gotIt}
        </>
      );
      break;
    case 'in-app': {
      const zalo = typeof navigator !== 'undefined' && isZaloWebView(navigator.userAgent);
      body = (
        <>
          <p className="m-0 text-base leading-normal text-foreground">
            {t(zalo ? 'install.inAppZalo' : 'install.inAppOther')}
          </p>
          <Steps steps={[{ key: 'install.inAppStep1' }, { key: 'install.inAppStep2' }]} />
          <Button variant="secondary" block onClick={copyLink}>
            {t('install.copyLink')}
          </Button>
          <Button variant="ghost" block onClick={onClose}>
            {t('install.notNow')}
          </Button>
        </>
      );
      break;
    }
    default:
      body = (
        <>
          <Steps steps={[{ key: 'install.desktopStep' }]} />
          {gotIt}
        </>
      );
  }

  // While the sheet is open its modal layer hides everything outside it from screen readers, so the status
  // lives inside the sheet then and outside it once the sheet has closed.
  const snackbar = message !== null ? <Snackbar message={message} /> : null;

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t(context === 'in-app' ? 'install.inAppTitle' : 'install.title')}>
        <div
          data-testid="install-sheet"
          className={cn('fsl-install-sheet', `fsl-install-sheet--${context}`, 'flex flex-col gap-3')}
        >
          {body}
          {open && snackbar}
        </div>
      </Sheet>
      {!open && snackbar}
    </>
  );
}
