import { useT } from '../i18n';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Pill } from '../components/Pill';
import { cn } from '@/lib/utils';

export function Privacy() {
  const t = useT();

  return (
    <Screen title={t('privacy.title')} back="/" right={<LanguageButton />}>
      <div className={cn('fsl-privacy flex flex-col gap-4 py-4 max-w-[65ch]')}>
        <div className={cn('fsl-privacy__draft-notice mb-2')}>
          <Pill tone="warning">{t('privacy.draft')}</Pill>
        </div>

        <h2 className={cn('m-0 mt-4 mb-2 text-lg font-semibold text-foreground text-left leading-snug')}>
          Who runs the service
        </h2>
        <p className={cn('m-0 text-base text-muted-foreground text-left leading-normal')}>
          Coin Crew is operated as an independent group expense splitting
          service.
        </p>

        <h2 className={cn('m-0 mt-4 mb-2 text-lg font-semibold text-foreground text-left leading-snug')}>
          What information is stored
        </h2>
        <p className={cn('m-0 text-base text-muted-foreground text-left leading-normal')}>
          We store your name and email address from Google sign-in, or your Zalo user ID, display name and profile picture from Zalo sign-in (Zalo does not share your phone number); trip names,
          participant names, expense records, and payment records; and bank name,
          account number, and account holder name entered for VietQR settlements.
        </p>

        <h2 className={cn('m-0 mt-4 mb-2 text-lg font-semibold text-foreground text-left leading-snug')}>
          Why we process your data
        </h2>
        <p className={cn('m-0 text-base text-muted-foreground text-left leading-normal')}>
          We process this information to calculate cost splits and allow group
          members to pay each other directly via VietQR.
        </p>

        <h2 className={cn('m-0 mt-4 mb-2 text-lg font-semibold text-foreground text-left leading-snug')}>
          Who sees your information
        </h2>
        <p className={cn('m-0 text-base text-muted-foreground text-left leading-normal')}>
          Your trip information is visible to other members of the same trip. Your
          bank account details are only displayed to members who owe you money.
        </p>

        <h2 className={cn('m-0 mt-4 mb-2 text-lg font-semibold text-foreground text-left leading-snug')}>
          Where data is hosted
        </h2>
        <p className={cn('m-0 text-base text-muted-foreground text-left leading-normal')}>
          Data is hosted on Cloudflare infrastructure. Servers and storage may be
          located outside Vietnam.
        </p>

        <h2 className={cn('m-0 mt-4 mb-2 text-lg font-semibold text-foreground text-left leading-snug')}>
          How long data is kept
        </h2>
        <p className={cn('m-0 text-base text-muted-foreground text-left leading-normal')}>
          Your data is retained until you delete the trip or request the deletion
          of your account.
        </p>

        <h2 className={cn('m-0 mt-4 mb-2 text-lg font-semibold text-foreground text-left leading-snug')}>
          Your rights
        </h2>
        <p className={cn('m-0 text-base text-muted-foreground text-left leading-normal')}>
          You have the right to access, correct, and delete your data, and you may
          withdraw your consent at any time.
        </p>

        <h2 className={cn('m-0 mt-4 mb-2 text-lg font-semibold text-foreground text-left leading-snug')}>
          Contact
        </h2>
        <p className={cn('m-0 text-base text-muted-foreground text-left leading-normal')}>
          For privacy inquiries or requests, contact{' '}
          <a
            href="mailto:privacy@example.com"
            className={cn(
              'text-primary underline underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs',
            )}
          >
            privacy@example.com
          </a>
          .
        </p>
      </div>
    </Screen>
  );
}
