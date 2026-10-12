import { useLang, useT } from '../i18n';
import './LangSwitch.css';

export function LangSwitch() {
  const [lang, setLang] = useLang();
  const t = useT();

  const otherLang = lang === 'vi' ? 'en' : 'vi';
  const label = otherLang === 'vi' ? t('lang.vi') : t('lang.en');

  return (
    <button
      type="button"
      className="fsl-lang-switch"
      onClick={() => setLang(otherLang)}
      aria-label={`Switch language to ${label}`}
    >
      {label}
    </button>
  );
}
