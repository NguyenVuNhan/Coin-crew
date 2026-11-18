import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '@cc/web-i18n';
import { ActionSheet } from '@cc/web-ui/components/ActionSheet';
import { Icon } from '@cc/web-ui/components/icons';
import type { RowAction } from '@cc/web-ui/components/ActionRow';

export function PersonalSettingsMenu(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const actions: RowAction[] = [
    {
      id: 'wallets',
      label: t('personalSettings.wallets'),
      icon: 'wallet',
      onSelect: () => navigate('/wallets'),
    },
    {
      id: 'categories',
      label: t('personalSettings.categories'),
      icon: 'pie',
      onSelect: () => navigate('/personal/categories'),
    },
    {
      id: 'assets',
      label: t('personalSettings.assets'),
      icon: 'coins',
      onSelect: () => navigate('/personal/assets'),
    },
    {
      id: 'tags',
      label: t('personalSettings.tags'),
      icon: 'receipt',
      onSelect: () => navigate('/personal/tags'),
    },
  ];

  return (
    <>
      <button
        type="button"
        aria-label={t('personalSettings.title')}
        title={t('personalSettings.title')}
        data-testid="personal-settings-btn"
        onClick={() => setOpen(true)}
        className="fsl-personal-settings__btn size-11 inline-flex items-center justify-center rounded-full text-foreground bg-transparent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 transition-colors motion-reduce:transition-none cursor-pointer border-0 p-0"
      >
        <Icon name="settings" size={20} />
      </button>
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('personalSettings.title')}
        actions={actions}
      />
    </>
  );
}
