import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { APP_NAME } from '../config';
import { useT } from '../i18n';
import { apiFetch } from '../api/client';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import './Landing.css';

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    consentAt: string | null;
  } | null;
}

export function Landing() {
  const t = useT();
  const navigate = useNavigate();

  const meQuery = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/api/me'),
  });

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
    <Screen title={APP_NAME}>
      <div className="fsl-landing">
        <p className="fsl-landing__tagline">{t('landing.tagline')}</p>
        <div className="fsl-landing__action">
          <Button variant="primary" block href={signInUrl}>
            {t('landing.signIn')}
          </Button>
        </div>
      </div>
    </Screen>
  );
}
