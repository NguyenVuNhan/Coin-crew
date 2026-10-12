import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { LangSwitch } from './LangSwitch';
import './Screen.css';

export interface ScreenProps {
  title: string;
  back?: string;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Screen({
  title,
  back,
  right = <LangSwitch />,
  children,
  className = '',
}: ScreenProps) {
  const t = useT();

  return (
    <div className={`fsl-screen ${className}`.trim()}>
      <header className="fsl-screen__header">
        <div className="fsl-screen__header-inner">
          {back ? (
            <a
              href={back}
              className="fsl-screen__back"
              aria-label={t('common.back')}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </a>
          ) : (
            <div className="fsl-screen__header-spacer" aria-hidden="true" />
          )}

          <h1 className="fsl-screen__title">{title}</h1>

          <div className="fsl-screen__right">{right}</div>
        </div>
      </header>

      <main className="fsl-screen__content">{children}</main>
    </div>
  );
}
