import { useLang, useT } from '../i18n';
import { Icon } from './icons';
import './LanguageButton.css';

export function LanguageButton() {
  const [lang, setLang] = useLang();
  const t = useT();

  const target = lang === 'vi' ? 'en' : 'vi';
  const targetName = target === 'vi' ? t('lang.vi') : t('lang.en');
  const label = t('lang.switchTo', { lang: targetName });

  const handleClick = () => {
    try {
      localStorage.setItem('fsl_lang', target);
    } catch {
      // ignore
    }
    setLang(target);
  };

  return (
    <button
      type="button"
      className="fsl-language-button"
      aria-label={label}
      title={label}
      onClick={handleClick}
    >
      <Icon name="language" size={18} />
      <span className="fsl-lang-btn__label">{lang === 'vi' ? t('lang.vi') : t('lang.en')}</span>
    </button>
  );
}
