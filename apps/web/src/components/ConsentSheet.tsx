import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import { apiSend } from '../api/client';
import { Sheet } from './Sheet';
import { Button } from './Button';

export function ConsentSheet() {
  const t = useT();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const meQuery = useMe();

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
      <div className={cn('fsl-consent-sheet__content flex flex-col gap-4 py-2')}>
        <p className={cn('fsl-consent-sheet__body m-0 text-base text-foreground text-left leading-normal')}>{t('consent.body')}</p>
        <div className={cn('fsl-consent-sheet__link-wrap m-0')}>
          <Link
            to="/privacy"
            className={cn('fsl-consent-sheet__link inline-block text-base font-medium text-primary underline underline-offset-3 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm')}
          >
            {t('consent.readNotice')}
          </Link>
        </div>
        <label htmlFor="consent-agree-checkbox" className={cn('fsl-consent-sheet__checkbox-label flex items-center gap-3 min-h-11 text-base text-foreground cursor-pointer select-none')}>
          <input
            id="consent-agree-checkbox"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className={cn('fsl-consent-sheet__checkbox size-5 accent-primary cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
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

