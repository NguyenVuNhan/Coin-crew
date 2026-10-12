import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { apiFetch, apiSend } from '../api/client';
import { Sheet } from './Sheet';
import { Button } from './Button';
import './ConsentSheet.css';

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    consentAt: string | null;
  } | null;
}

export function ConsentSheet() {
  const t = useT();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const meQuery = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/api/me'),
  });

  const consentMutation = useMutation({
    mutationFn: () => apiSend<void>('/api/me/consent', 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const user = meQuery.data?.user;
  const needsConsent = Boolean(user && user.consentAt === null);

  if (!needsConsent) {
    return null;
  }

  return (
    <Sheet open title={t('consent.title')} dismissible={false}>
      <div className="fsl-consent-sheet__content">
        <p className="fsl-consent-sheet__body">{t('consent.body')}</p>
        <div className="fsl-consent-sheet__link-wrap">
          <Link to="/privacy" className="fsl-consent-sheet__link">
            {t('consent.readNotice')}
          </Link>
        </div>
        <label htmlFor="consent-agree-checkbox" className="fsl-consent-sheet__checkbox-label">
          <input
            id="consent-agree-checkbox"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="fsl-consent-sheet__checkbox"
          />
          <span>{t('consent.agree')}</span>
        </label>
        <Button
          variant="primary"
          block
          disabled={!agreed || consentMutation.isPending}
          loading={consentMutation.isPending}
          onClick={() => consentMutation.mutate()}
        >
          {t('common.continue')}
        </Button>
      </div>
    </Sheet>
  );
}
