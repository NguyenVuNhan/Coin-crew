import { useT } from '../i18n';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Pill } from '../components/Pill';
import './Privacy.css';

export function Privacy() {
  const t = useT();

  return (
    <Screen title={t('privacy.title')} back="/" right={<LanguageButton />}>
      <div className="fsl-privacy">
        <div className="fsl-privacy__draft-notice">
          <Pill tone="warning">{t('privacy.draft')}</Pill>
        </div>

        <h2>Who runs the service</h2>
        <p>
          Coin Crew is operated as an independent group expense splitting
          service.
        </p>

        <h2>What information is stored</h2>
        <p>
          We store your name and email address from Google sign-in, or your Zalo user ID, display name and profile picture from Zalo sign-in (Zalo does not share your phone number); trip names,
          participant names, expense records, and payment records; and bank name,
          account number, and account holder name entered for VietQR settlements.
        </p>

        <h2>Why we process your data</h2>
        <p>
          We process this information to calculate cost splits and allow group
          members to pay each other directly via VietQR.
        </p>

        <h2>Who sees your information</h2>
        <p>
          Your trip information is visible to other members of the same trip. Your
          bank account details are only displayed to members who owe you money.
        </p>

        <h2>Where data is hosted</h2>
        <p>
          Data is hosted on Cloudflare infrastructure. Servers and storage may be
          located outside Vietnam.
        </p>

        <h2>How long data is kept</h2>
        <p>
          Your data is retained until you delete the trip or request the deletion
          of your account.
        </p>

        <h2>Your rights</h2>
        <p>
          You have the right to access, correct, and delete your data, and you may
          withdraw your consent at any time.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy inquiries or requests, contact{' '}
          <a href="mailto:privacy@example.com">privacy@example.com</a>.
        </p>
      </div>
    </Screen>
  );
}
