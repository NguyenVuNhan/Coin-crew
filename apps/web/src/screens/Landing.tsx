import { Fragment, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { APP_NAME } from '../config';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { useMe } from '../api/hooks';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/icons';
import { LanguageButton } from '../components/LanguageButton';
import './Landing.css';

const STEPS: { icon: IconName; title: MessageKey; body: MessageKey }[] = [
  { icon: 'map', title: 'landing.step1', body: 'landing.step1Body' },
  { icon: 'link', title: 'landing.step2', body: 'landing.step2Body' },
  { icon: 'qr', title: 'landing.step3', body: 'landing.step3Body' },
];

export function Landing() {
  const t = useT();
  const navigate = useNavigate();

  const meQuery = useMe();

  const user = meQuery.data?.user;

  useEffect(() => {
    if (user) {
      navigate('/trips', { replace: true });
    }
  }, [user, navigate]);

  if (user) {
    return null;
  }

  const signInUrl = `/api/auth/google/start?returnTo=${encodeURIComponent('/trips')}`;

  return (
    <Screen title={APP_NAME} right={<LanguageButton />}>
      <div className="fsl-landing">
        <section className="fsl-landing__hero">
          <h2 className="fsl-landing__headline">
            {/* Each sentence wraps on its own, so a phone never breaks "Settle up" across lines. */}
            {t('landing.headline')
              .split('. ')
              .map((sentence, i, all) => (
                <Fragment key={i}>
                  {i > 0 ? ' ' : null}
                  <span className="fsl-landing__sentence">{i < all.length - 1 ? `${sentence}.` : sentence}</span>
                </Fragment>
              ))}
          </h2>
          <p className="fsl-landing__tagline">{t('landing.tagline')}</p>
        </section>

        <Button variant="primary" block href={signInUrl}>
          {t('landing.signIn')}
        </Button>

        <section className="fsl-landing__how">
          <h2 className="fsl-landing__section-title">{t('landing.howItWorks')}</h2>
          <ol className="fsl-landing__steps">
            {STEPS.map((step) => (
              <li key={step.icon} className="fsl-landing__step">
                <span className="fsl-landing__step-icon">
                  <Icon name={step.icon} size={20} />
                </span>
                <div className="fsl-landing__step-text">
                  <span className="fsl-landing__step-title">{t(step.title)}</span>
                  <span className="fsl-landing__step-body">{t(step.body)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="fsl-landing__footer">
          <Link to="/privacy" className="fsl-landing__privacy">
            {t('privacy.title')}
          </Link>
        </footer>
      </div>
    </Screen>
  );
}
