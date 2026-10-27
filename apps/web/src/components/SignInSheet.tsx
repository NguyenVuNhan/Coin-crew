import { useT } from '../i18n';
import { Sheet } from './Sheet';
import { SignInButtons } from './SignInButtons';

export interface SignInSheetProps {
  open: boolean;
  onClose(): void;
  returnTo: string;
}

export function SignInSheet({ open, onClose, returnTo }: SignInSheetProps) {
  const t = useT();

  return (
    <Sheet open={open} onClose={onClose} title={t('who.signInTitle')}>
      <SignInButtons returnTo={returnTo} layout="stack" />
    </Sheet>
  );
}
