import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { Icon } from './icons';
import { BottomBar } from './BottomBar';
import './Screen.css';

export interface ScreenProps {
  title: string;
  titleAlign?: 'left' | 'center';
  back?: string;
  /** Goes back by itself instead of linking to `back` (the trip details use it to return to the list in history). */
  onBack?: () => void;
  right?: ReactNode;
  bottomBar?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Screen({
  title,
  titleAlign = 'center',
  back,
  onBack,
  right,
  bottomBar,
  wide,
  children,
  className,
}: ScreenProps) {
  const t = useT();

  const rootClass = [
    'fsl-screen',
    wide && 'fsl-screen--wide',
    bottomBar && 'fsl-screen--has-bar',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const headerClass = [
    'fsl-screen__header',
    titleAlign === 'left' && 'fsl-screen__header--title-left',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <header className={headerClass}>
        <div className="fsl-screen__header-inner">
          {onBack ? (
            <button
              type="button"
              className="fsl-screen__back"
              aria-label={t('common.back')}
              title={t('common.back')}
              onClick={onBack}
            >
              <Icon name="back" size={24} />
            </button>
          ) : back ? (
            <Link
              to={back}
              className="fsl-screen__back"
              aria-label={t('common.back')}
              title={t('common.back')}
            >
              <Icon name="back" size={24} />
            </Link>
          ) : (
            <div className="fsl-screen__header-spacer" aria-hidden="true" />
          )}

          <h1 className="fsl-screen__title">{title}</h1>

          <div className="fsl-screen__right">{right}</div>
        </div>
      </header>

      <main className="fsl-screen__content">{children}</main>

      {bottomBar ? <BottomBar>{bottomBar}</BottomBar> : null}
    </div>
  );
}

