import { useT } from '@cc/web-i18n';
import { Screen } from '../components/Screen';
import { LanguageButton } from '@cc/web-ui/components/LanguageButton';
import { PrivacyNotice } from '../components/PrivacyNotice';

export function Privacy() {
  const t = useT();

  return (
    <Screen title={t('privacy.title')} back="/" right={<LanguageButton />}>
      <PrivacyNotice />
    </Screen>
  );
}
