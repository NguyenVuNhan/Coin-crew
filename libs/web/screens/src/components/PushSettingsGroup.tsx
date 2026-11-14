import { useEffect, useId, useState, type JSX } from 'react';
import type { PushLeadMinutes } from '@cc/core';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { usePlatform } from '@cc/web-platform';
import { usePushState } from '@cc/web-platform/push';
import {
  useEnablePush,
  usePushDevice,
  usePushKey,
  useUpdatePushDevice,
} from '@cc/web-data-access/push';
import { cn } from '@cc/web-ui/lib/utils';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cc/web-ui/components/ui/select';
import { InstallAppSheet } from './InstallAppSheet';

const LEAD_OPTIONS: { value: PushLeadMinutes; key: MessageKey }[] = [
  { value: 15, key: 'push.lead15' },
  { value: 30, key: 'push.lead30' },
  { value: 60, key: 'push.lead60' },
  { value: 120, key: 'push.lead120' },
];

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

export function PushSettingsGroup(): JSX.Element | null {
  const t = useT();
  const platform = usePlatform();
  const [, setVisibilityTick] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibilityChange = () => {
      setVisibilityTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const state = usePushState();
  const isZmp = platform.kind === 'zmp';

  const keyQuery = usePushKey();
  const hasServerKey = typeof keyQuery.data === 'string';

  const deviceQuery = usePushDevice(!isZmp && state === 'granted' && keyQuery.data !== null);
  const enableMutation = useEnablePush();
  const updateMutation = useUpdatePushDevice();

  const [installOpen, setInstallOpen] = useState(false);

  const newSessionId = useId();
  const newSessionDescId = useId();
  const reminderId = useId();
  const reminderDescId = useId();
  const expenseId = useId();
  const expenseDescId = useId();

  if (isZmp || state === 'hidden' || keyQuery.data === null) {
    return null;
  }

  const device = deviceQuery.data ?? null;
  const error = enableMutation.error || updateMutation.error || deviceQuery.error;

  let body: JSX.Element;
  if (state === 'unsupported') {
    body = (
      <div className="fsl-push-settings__unsupported flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm leading-relaxed text-muted-foreground">
        <Icon name="info" size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="m-0">{t('push.unsupported')}</p>
      </div>
    );
  } else if (state === 'ios-needs-install') {
    body = (
      <>
        <div className="rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setInstallOpen(true)}
            className="fsl-push-settings__install-row flex w-full min-h-11 items-center justify-between gap-3 rounded-lg bg-transparent p-3 text-left transition-colors motion-reduce:transition-none hover:bg-accent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex flex-1 flex-col gap-0.5 min-w-0">
              <span className="text-base font-semibold leading-snug text-foreground">
                {t('push.iosInstallTitle')}
              </span>
              <span className="text-sm leading-normal text-muted-foreground">
                {t('push.iosInstallDesc')}
              </span>
            </span>
            <Icon name="chevronRight" size={18} className="shrink-0 text-muted-foreground" />
          </button>
        </div>
        <InstallAppSheet open={installOpen} onClose={() => setInstallOpen(false)} />
      </>
    );
  } else if (state === 'blocked') {
    body = (
      <div className="fsl-push-settings__blocked flex flex-col gap-2 rounded-xl bg-secondary p-3 text-sm leading-relaxed text-secondary-foreground">
        <div className="flex items-start gap-2 font-semibold">
          <Icon name="bell-off" size={18} className="mt-0.5 shrink-0" />
          <span>{t('push.blockedTitle')}</span>
        </div>
        <ol className="m-0 flex list-decimal flex-col gap-0.5 pl-7">
          <li>{t('push.blockedStep1')}</li>
          <li>{t('push.blockedStep2')}</li>
          <li>{t('push.blockedStep3')}</li>
        </ol>
      </div>
    );
  } else if (state === 'granted' && device !== null) {
    const leadText = t(leadMessageKey(device.reminderLeadMinutes));
    body = (
      <div className="fsl-push-settings__list flex flex-col divide-y divide-border rounded-xl border border-border bg-card p-1">
        <div className="flex min-h-11 items-center justify-between gap-3 p-3">
          <div className="flex flex-1 flex-col gap-0.5 pr-2">
            <Label
              htmlFor={newSessionId}
              className="cursor-pointer text-base font-semibold leading-snug text-foreground"
            >
              {t('push.newSession')}
            </Label>
            <p id={newSessionDescId} className="m-0 text-sm leading-normal text-muted-foreground">
              {t('push.newSessionDesc')}
            </p>
          </div>
          <Switch
            id={newSessionId}
            data-testid="push-switch-newSession"
            checked={device.newSession}
            onCheckedChange={(checked) => updateMutation.mutate({ newSession: checked })}
            disabled={updateMutation.isPending}
            aria-describedby={newSessionDescId}
          />
        </div>

        <div className="flex flex-col gap-2 p-3">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="flex flex-1 flex-col gap-0.5 pr-2">
              <Label
                htmlFor={reminderId}
                className="cursor-pointer text-base font-semibold leading-snug text-foreground"
              >
                {t('push.reminder')}
              </Label>
              <p id={reminderDescId} className="m-0 text-sm leading-normal text-muted-foreground">
                {t('push.reminderDesc', { lead: leadText })}
              </p>
            </div>
            <Switch
              id={reminderId}
              data-testid="push-switch-sessionReminder"
              checked={device.sessionReminder}
              onCheckedChange={(checked) => updateMutation.mutate({ sessionReminder: checked })}
              disabled={updateMutation.isPending}
              aria-describedby={reminderDescId}
            />
          </div>

          {device.sessionReminder && (
            <Select
              value={String(device.reminderLeadMinutes)}
              onValueChange={(val) =>
                updateMutation.mutate({ reminderLeadMinutes: Number(val) as PushLeadMinutes })
              }
              disabled={updateMutation.isPending}
            >
              <SelectTrigger
                data-testid="push-lead"
                aria-label={t('push.reminder')}
                className="fsl-push-settings__lead min-h-11 h-11 rounded-xl bg-card px-3 text-base text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)} className="min-h-11 text-base">
                    {t(opt.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex min-h-11 items-center justify-between gap-3 p-3">
          <div className="flex flex-1 flex-col gap-0.5 pr-2">
            <Label
              htmlFor={expenseId}
              className="cursor-pointer text-base font-semibold leading-snug text-foreground"
            >
              {t('push.expense')}
            </Label>
            <p id={expenseDescId} className="m-0 text-sm leading-normal text-muted-foreground">
              {t('push.expenseDesc')}
            </p>
          </div>
          <Switch
            id={expenseId}
            data-testid="push-switch-expenseNew"
            checked={device.expenseNew}
            onCheckedChange={(checked) => updateMutation.mutate({ expenseNew: checked })}
            disabled={updateMutation.isPending}
            aria-describedby={expenseDescId}
          />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <div className="rounded-xl border border-border bg-card p-1">
          <div className="flex min-h-11 items-center justify-between gap-3 p-3">
            <div className="flex flex-1 flex-col gap-0.5">
              <p className="m-0 text-base font-semibold leading-snug text-foreground">
                {t('push.enableTitle')}
              </p>
              <p className="m-0 text-sm leading-normal text-muted-foreground">
                {t('push.enableDesc')}
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={!hasServerKey || enableMutation.isPending}
          loading={enableMutation.isPending}
          onClick={() => enableMutation.mutate()}
          className="fsl-push-settings__enable-btn min-h-11 self-start"
        >
          <Icon name="bell" size={16} />
          <span>{t('push.enableButton')}</span>
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="push-settings"
      className={cn('fsl-push-settings', `fsl-push-settings--${state}`, 'flex flex-col gap-2')}
    >
      <div className="flex flex-col gap-0.5 px-1">
        <p className="fsl-push-settings__label m-0 text-sm font-semibold text-muted-foreground">
          {t('push.sectionLabel')}
        </p>
        <p className="fsl-push-settings__hint m-0 text-sm leading-relaxed text-muted-foreground">
          {t('push.sectionHint')}
        </p>
      </div>
      {body}
      {error && <InlineError error={error} />}
    </div>
  );
}
