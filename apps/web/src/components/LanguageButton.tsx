import { cn } from '@/lib/utils';
import { useLang, useT } from '../i18n';
import { Icon } from './icons';

export interface LanguageButtonProps {
  className?: string;
}

export function LanguageButton({ className }: LanguageButtonProps = {}) {
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
      className={cn(
        'fsl-language-button inline-flex items-center justify-center gap-1.5 min-h-11 h-11 px-3 rounded-full bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none text-sm font-medium',
        className,
      )}
      aria-label={label}
      title={label}
      onClick={handleClick}
    >
      <Icon name="language" size={18} />
      <span className="fsl-lang-btn__label">{lang === 'vi' ? t('lang.vi') : t('lang.en')}</span>
    </button>
  );
}
