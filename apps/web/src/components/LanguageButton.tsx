import { useLang, useT } from '../i18n';
import { Icon } from './icons';
import './LanguageButton.css';

export function LanguageButton() {
  const [lang, setLang] = useLang();
  const t = useT();

  const target = lang === 'vi' ? 'en' : 'vi';
  const targetName = target === 'vi' ? t('lang.vi') : t('lang.en');
  const label = t('lang.switchTo', { lang: targetName });

  return (
    <button
      type="button"
      className="fsl-language-button"
      aria-label={label}
      title={label}
      onClick={() => setLang(target)}
    >
      <Icon name="language" size={20} />
    </button>
  );
}
