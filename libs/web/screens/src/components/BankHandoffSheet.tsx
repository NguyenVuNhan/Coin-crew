import { useEffect, useReducer, useRef, type JSX } from 'react';
import { Loader2, Check } from 'lucide-react';
import { bankAppLink, type BankApp } from '@cc/core';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { usePlatform } from '../platform';
import { bankAppLogo } from '../lib/bankApps';
import { isIosDevice } from '../platform/browser';
import { isZaloWebView } from '@cc/web-util/zaloEnv';
import { useT } from '@cc/web-i18n';

export interface BankHandoffSheetProps {
  open: boolean;
  onClose(): void;
  app: BankApp;
  makePng(): Promise<Blob | null>;
  fileName: string;
  /** Saving failed outright. Return true when a fallback (e.g. the long-press picture) is now showing: the bank then waits for the Open button instead of opening by itself. */
  onSaveFailed?(): boolean | void;
}

type Step1State = 'saving' | 'saved' | 'save-failed';
type Step2State = 'waiting' | 'opening' | 'opened' | 'open-failed';

interface HandoffState {
  step1: Step1State;
  step2: Step2State;
}

type HandoffAction =
  | { type: 'RESET' }
  | { type: 'STEP1_SAVING' }
  | { type: 'STEP1_SAVED' }
  | { type: 'STEP1_FAILED' }
  | { type: 'STEP2_OPENING' }
  | { type: 'STEP2_OPENED' }
  | { type: 'STEP2_FAILED' };

const initialHandoffState: HandoffState = {
  step1: 'saving',
  step2: 'waiting',
};

function handoffReducer(state: HandoffState, action: HandoffAction): HandoffState {
  switch (action.type) {
    case 'RESET':
      return { step1: 'saving', step2: 'waiting' };
    case 'STEP1_SAVING':
      return { ...state, step1: 'saving' };
    case 'STEP1_SAVED':
      return { ...state, step1: 'saved' };
    case 'STEP1_FAILED':
      return { ...state, step1: 'save-failed' };
    case 'STEP2_OPENING':
      return { ...state, step2: 'opening' };
    case 'STEP2_OPENED':
      return { ...state, step2: 'opened' };
    case 'STEP2_FAILED':
      return { ...state, step2: 'open-failed' };
    default:
      return state;
  }
}

export function BankHandoffSheet({
  open,
  onClose,
  app,
  makePng,
  fileName,
  onSaveFailed,
}: BankHandoffSheetProps): JSX.Element {
  const t = useT();
  const platform = usePlatform();
  const [state, dispatch] = useReducer(handoffReducer, initialHandoffState);

  const aliveRef = useRef(false);

  const makePngRef = useRef(makePng);
  makePngRef.current = makePng;
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;
  const appRef = useRef(app);
  appRef.current = app;
  const onSaveFailedRef = useRef(onSaveFailed);
  onSaveFailedRef.current = onSaveFailed;
  const platformRef = useRef(platform);
  platformRef.current = platform;

  const handleRetryStep1 = async () => {
    dispatch({ type: 'STEP1_SAVING' });
    let r: 'saved' | 'cancelled' | 'failed' = 'failed';
    let png: Blob | null = null;
    try {
      png = await makePngRef.current();
      if (!aliveRef.current) return;
      if (png) {
        r = await platformRef.current.saveImage(png, fileNameRef.current);
      } else {
        r = 'failed';
      }
    } catch {
      r = 'failed';
    }
    if (!aliveRef.current) return;

    if (r === 'saved') {
      dispatch({ type: 'STEP1_SAVED' });
    } else {
      dispatch({ type: 'STEP1_FAILED' });
      if (r === 'failed' || !png) {
        onSaveFailedRef.current?.();
      }
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    aliveRef.current = true;
    dispatch({ type: 'RESET' });

    let cancelled = false;
    let timer500: ReturnType<typeof setTimeout> | null = null;
    let timer3000: ReturnType<typeof setTimeout> | null = null;
    let isOpening = false;
    let hasHidden = false;

    const handleVisibilityChange = () => {
      if (cancelled || !isOpening) return;
      if (document.visibilityState === 'hidden') {
        hasHidden = true;
      } else if (document.visibilityState === 'visible' && hasHidden) {
        if (timer3000) clearTimeout(timer3000);
        dispatch({ type: 'STEP2_OPENED' });
      }
    };

    const handlePageHide = () => {
      if (cancelled || !isOpening) return;
      hasHidden = true;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    async function runFlow() {
      let r: 'saved' | 'cancelled' | 'failed' = 'failed';
      let png: Blob | null = null;
      try {
        png = await makePngRef.current();
        if (cancelled) return;
        if (png) {
          r = await platformRef.current.saveImage(png, fileNameRef.current);
        } else {
          r = 'failed';
        }
      } catch {
        r = 'failed';
      }

      if (cancelled) return;

      let fallbackShown = false;
      if (r === 'saved') {
        dispatch({ type: 'STEP1_SAVED' });
      } else {
        dispatch({ type: 'STEP1_FAILED' });
        if (r === 'failed' || !png) {
          fallbackShown = onSaveFailedRef.current?.() === true;
        }
      }

      if (fallbackShown) {
        // Leaving the page now would take the picture away before it can be saved.
        dispatch({ type: 'STEP2_FAILED' });
        return;
      }

      timer500 = setTimeout(async () => {
        if (cancelled) return;
        isOpening = true;
        dispatch({ type: 'STEP2_OPENING' });

        timer3000 = setTimeout(() => {
          if (cancelled) return;
          if (!hasHidden) {
            dispatch({ type: 'STEP2_FAILED' });
          }
        }, 3000);

        try {
          const url = bankAppLink(appRef.current.appId);
          const res = await platformRef.current.openExternal(url);
          if (cancelled) return;
          if (res === 'blocked') {
            if (timer3000) clearTimeout(timer3000);
            dispatch({ type: 'STEP2_FAILED' });
          }
        } catch {
          if (cancelled) return;
          if (timer3000) clearTimeout(timer3000);
          dispatch({ type: 'STEP2_FAILED' });
        }
      }, 500);
    }

    void runFlow();

    return () => {
      cancelled = true;
      aliveRef.current = false;
      if (timer500) clearTimeout(timer500);
      if (timer3000) clearTimeout(timer3000);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [open]);

  const logo = bankAppLogo(app.appId);

  return (
    <Sheet open={open} onClose={onClose} title={t('pay.handoffTitle', { app: app.appName })}>
      <div className="flex flex-col gap-3">
        {logo && (
          <div className="flex items-center justify-center pb-1">
            <img src={logo} alt="" className="size-12 rounded-xl object-contain" />
          </div>
        )}

        {/* Step 1: Save the QR */}
        <div
          className="fsl-bank-step flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card min-h-11"
          data-step="1"
          data-state={state.step1}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-7 items-center justify-center shrink-0">
              {state.step1 === 'saving' && <Loader2 className="size-5 animate-spin text-primary" />}
              {state.step1 === 'saved' && <Check className="size-5 text-success" />}
              {state.step1 === 'save-failed' && (
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  1
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-normal" aria-live="polite">
                {state.step1 === 'saving' && t('pay.saving')}
                {state.step1 === 'saved' && t('pay.savedStep')}
                {state.step1 === 'save-failed' && t('pay.saveStep')}
              </p>
              {state.step1 === 'saving' && isIosDevice() && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                  {t('pay.savingIos')}
                </p>
              )}
            </div>
          </div>
          {state.step1 === 'save-failed' && (
            <Button variant="secondary" className="min-h-11 shrink-0 px-4" onClick={() => void handleRetryStep1()}>
              {t('pay.saveAction')}
            </Button>
          )}
        </div>

        {/* Step 2: Open the bank app */}
        <div
          className="fsl-bank-step flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card min-h-11"
          data-step="2"
          data-state={state.step2}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-7 items-center justify-center shrink-0">
              {state.step2 === 'waiting' && (
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  2
                </span>
              )}
              {state.step2 === 'opening' && <Loader2 className="size-5 animate-spin text-primary" />}
              {state.step2 === 'opened' && <Check className="size-5 text-success" />}
              {state.step2 === 'open-failed' && (
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  2
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-normal" aria-live="polite">
                {state.step2 === 'waiting' && t('pay.openStep', { app: app.appName })}
                {state.step2 === 'opening' && t('pay.opening', { app: app.appName })}
                {state.step2 === 'opened' && t('pay.openedStep', { app: app.appName })}
                {state.step2 === 'open-failed' && t('pay.openStep', { app: app.appName })}
              </p>
              {state.step2 === 'opening' && isZaloWebView() && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                  {t('pay.zaloAsks')}
                </p>
              )}
              {state.step2 === 'open-failed' && (
                <p className="fsl-bank-step__manual text-xs text-muted-foreground mt-0.5 leading-normal">
                  {platform.kind === 'web' ? t('pay.notOpened') : t('pay.openManually', { app: app.appName })}
                </p>
              )}
            </div>
          </div>
          {/* The Mini App can't open other apps until Zalo grants openOutApp, so it gets the instruction above instead. */}
          {state.step2 === 'open-failed' && platform.kind === 'web' && (
            <Button variant="secondary" className="min-h-11 shrink-0 px-4" href={bankAppLink(app.appId)}>
              {t('pay.openAction')}
            </Button>
          )}
        </div>

        {/* Tip under the steps */}
        <div className="rounded-xl bg-warning-soft p-3 text-sm text-foreground leading-normal">
          {t('pay.handoffTip', { app: app.appName })}
        </div>
      </div>
    </Sheet>
  );
}
