import { useId } from 'react';
import { useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserNotificationSettings } from '@cc/core';
import { apiFetch, apiSend } from '@cc/web-data-access/client';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/Button';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { PushSettingsGroup } from './PushSettingsGroup';
import { signInHref } from './SignInButtons';

export interface NotificationUser {
  email?: string | null;
  name?: string | null;
}

export interface NotificationSettingsModalProps {
  open: boolean;
  onClose: () => void;
  user?: NotificationUser | null;
}

const DEFAULT_SETTINGS: UserNotificationSettings = {
  transactionCrud: true,
  loanReminders: true,
  monthlyNotice: true,
};

export function NotificationSettingsModal({
  open,
  onClose,
  user,
}: NotificationSettingsModalProps) {
  const t = useT();
  const location = useLocation();
  const returnTo = location.pathname;
  const queryClient = useQueryClient();

  const hasEmail = Boolean(user?.email);

  const txSwitchId = useId();
  const txDescId = useId();
  const loanSwitchId = useId();
  const loanDescId = useId();
  const monthlySwitchId = useId();
  const monthlyDescId = useId();

  const { data, error: fetchError } = useQuery<{ settings: UserNotificationSettings }>({
    queryKey: ['me', 'notifications'],
    queryFn: () => apiFetch<{ settings: UserNotificationSettings }>('/api/me/notifications'),
    enabled: open && hasEmail,
  });

  const settings = data?.settings ?? DEFAULT_SETTINGS;

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<UserNotificationSettings>) =>
      apiSend<{ settings: UserNotificationSettings }>('/api/me/notifications', 'PATCH', patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['me', 'notifications'] });
      const previous = queryClient.getQueryData<{ settings: UserNotificationSettings }>([
        'me',
        'notifications',
      ]);
      const prevSettings = previous?.settings ?? DEFAULT_SETTINGS;
      queryClient.setQueryData<{ settings: UserNotificationSettings }>(['me', 'notifications'], {
        settings: { ...prevSettings, ...patch },
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['me', 'notifications'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] });
    },
  });

  const handleToggle = (key: keyof UserNotificationSettings, checked: boolean) => {
    if (!hasEmail) return;
    updateMutation.mutate({ [key]: checked });
  };

  const linkHref = signInHref('google', returnTo, 'link');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('notifications.title')}
      className="fsl-notification-settings"
    >
      <div className="fsl-notification-settings__body flex flex-col gap-3">
        <PushSettingsGroup />

        <div className="flex flex-col gap-2">
          <p className="fsl-notification-settings__section-label m-0 px-1 text-sm font-semibold text-muted-foreground">
            {t('notifications.emailSection')}
          </p>

          <div className="fsl-notification-settings__list flex flex-col divide-y divide-border rounded-xl border border-border bg-card p-1">
            <div className="flex items-center justify-between gap-3 p-3 min-h-11">
              <div className="flex flex-col gap-0.5 flex-1 pr-2">
                <Label
                  htmlFor={txSwitchId}
                  className="font-semibold text-foreground text-base leading-snug cursor-pointer"
                >
                  {t('notifications.transactionCrud')}
                </Label>
                <p id={txDescId} className="m-0 text-sm text-muted-foreground leading-normal">
                  {t('notifications.transactionCrudDesc')}
                </p>
              </div>
              <Switch
                id={txSwitchId}
                checked={settings.transactionCrud}
                onCheckedChange={(checked) => handleToggle('transactionCrud', checked)}
                disabled={!hasEmail || updateMutation.isPending}
                aria-describedby={txDescId}
              />
            </div>

            <div className="flex items-center justify-between gap-3 p-3 min-h-11">
              <div className="flex flex-col gap-0.5 flex-1 pr-2">
                <Label
                  htmlFor={loanSwitchId}
                  className="font-semibold text-foreground text-base leading-snug cursor-pointer"
                >
                  {t('notifications.loanReminders')}
                </Label>
                <p id={loanDescId} className="m-0 text-sm text-muted-foreground leading-normal">
                  {t('notifications.loanRemindersDesc')}
                </p>
              </div>
              <Switch
                id={loanSwitchId}
                checked={settings.loanReminders}
                onCheckedChange={(checked) => handleToggle('loanReminders', checked)}
                disabled={!hasEmail || updateMutation.isPending}
                aria-describedby={loanDescId}
              />
            </div>

            <div className="flex items-center justify-between gap-3 p-3 min-h-11">
              <div className="flex flex-col gap-0.5 flex-1 pr-2">
                <Label
                  htmlFor={monthlySwitchId}
                  className="font-semibold text-foreground text-base leading-snug cursor-pointer"
                >
                  {t('notifications.monthlyNotice')}
                </Label>
                <p id={monthlyDescId} className="m-0 text-sm text-muted-foreground leading-normal">
                  {t('notifications.monthlyNoticeDesc')}
                </p>
              </div>
              <Switch
                id={monthlySwitchId}
                checked={settings.monthlyNotice}
                onCheckedChange={(checked) => handleToggle('monthlyNotice', checked)}
                disabled={!hasEmail || updateMutation.isPending}
                aria-describedby={monthlyDescId}
              />
            </div>

            {!hasEmail && (
              <div className="fsl-notification-settings__warning flex flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <Icon name="info" size={18} className="shrink-0 mt-0.5 text-muted-foreground" />
                  <p className="m-0 text-sm leading-relaxed text-foreground">
                    {t('notifications.noEmailWarning')}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  href={linkHref}
                  className="fsl-notification-settings__link-btn self-start min-h-11"
                >
                  <Icon name="link" size={16} />
                  <span>{t('account.link')}</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {(fetchError || updateMutation.error) && (
          <InlineError error={fetchError || updateMutation.error} />
        )}
      </div>
    </Sheet>
  );
}
