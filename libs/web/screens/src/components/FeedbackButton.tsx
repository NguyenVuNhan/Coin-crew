import { useState } from 'react';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { FeedbackSheet } from './FeedbackSheet';

/** Header icon that opens the anonymous feedback sheet. Sits top right, away from the bottom nav and the add button. */
export function FeedbackButton({ signedIn, testId = 'feedback-open' }: { signedIn: boolean; testId?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="fsl-feedback-button inline-flex items-center justify-center size-11 shrink-0 rounded-full bg-transparent text-foreground hover:bg-muted cursor-pointer transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('feedback.menu')}
        title={t('feedback.menu')}
        data-testid={testId}
        onClick={() => setOpen(true)}
      >
        <Icon name="headset" size={22} />
      </button>
      <FeedbackSheet open={open} onClose={() => setOpen(false)} signedIn={signedIn} />
    </>
  );
}
