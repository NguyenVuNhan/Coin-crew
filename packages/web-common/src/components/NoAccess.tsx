import { useT } from '../i18n';
import { EmptyState } from './EmptyState';
import { SignInButtons } from './SignInButtons';

/** A group answered 403: no member session and no link token on this device. Retrying can't help, signing in or the invite link can. */
export function NoAccess({ returnTo }: { returnTo: string }) {
  const t = useT();
  return (
    <EmptyState
      className="fsl-no-access mt-4"
      icon="ban"
      title={t('noAccess.title')}
      body={t('noAccess.body')}
      action={<SignInButtons returnTo={returnTo} layout="stack" />}
    />
  );
}
