import { Fragment, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { APP_NAME } from '../config';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { useMe } from '../api/hooks';
import { Screen } from '../components/Screen';
import { SignInButtons } from '../components/SignInButtons';
import { Icon, type IconName } from '../components/icons';
import { LanguageButton } from '../components/LanguageButton';
import { cn } from '@/lib/utils';

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

  return (
    <Screen title={APP_NAME} right={<LanguageButton />}>
      <div className={cn('fsl-landing flex flex-col gap-6 py-2')}>
        <section className={cn('fsl-landing__hero pt-6 text-center')}>
          <h2 className={cn('fsl-landing__headline m-0 text-xl font-semibold text-foreground text-center text-balance')}>
            {/* Each sentence wraps on its own, so a phone never breaks "Settle up" across lines. */}
            {t('landing.headline')
              .split('. ')
              .map((sentence, i, all) => (
                <Fragment key={i}>
                  {i > 0 ? ' ' : null}
                  <span className={cn('fsl-landing__sentence inline-block')}>
                    {i < all.length - 1 ? `${sentence}.` : sentence}
                  </span>
                </Fragment>
              ))}
          </h2>
          <p className={cn('fsl-landing__tagline m-0 mt-2 text-base text-muted-foreground text-center')}>
            {t('landing.tagline')}
          </p>
        </section>

        <SignInButtons layout="stack" returnTo="/trips" />

        <section className={cn('fsl-landing__how flex flex-col')}>
          <h2 className={cn('fsl-landing__section-title m-0 mb-2 text-sm font-semibold text-muted-foreground')}>
            {t('landing.howItWorks')}
          </h2>
          <ol className={cn('fsl-landing__steps list-none m-0 p-0 bg-card border border-border rounded-xl overflow-hidden divide-y divide-border')}>
            {STEPS.map((step) => (
              <li key={step.icon} className={cn('fsl-landing__step flex items-center gap-3 px-4 py-3 text-left')}>
                <span className={cn('fsl-landing__step-icon flex items-center justify-center shrink-0 size-10 rounded-full bg-secondary text-secondary-foreground')}>
                  <Icon name={step.icon} size={20} />
                </span>
                <div className={cn('fsl-landing__step-text flex flex-col min-w-0')}>
                  <span className={cn('fsl-landing__step-title block text-base font-semibold text-foreground')}>
                    {t(step.title)}
                  </span>
                  <span className={cn('fsl-landing__step-body block text-sm text-muted-foreground')}>
                    {t(step.body)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className={cn('fsl-landing__footer flex justify-center text-center')}>
          <Link
            to="/privacy"
            className={cn(
              'fsl-landing__privacy inline-flex items-center justify-center min-h-11 px-3 text-sm text-muted-foreground underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md',
            )}
          >
            {t('privacy.title')}
          </Link>
        </footer>
      </div>
    </Screen>
  );
}
