import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '../i18n';
import { useIsWide } from '../lib/media';
import { apiSend } from '../api/client';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { LanguageButton } from './LanguageButton';
import { InlineError } from './InlineError';
import { Button } from './Button';
import { Icon } from './icons';
import './AccountMenu.css';

export interface AccountMenuProps {
  user: {
    name: string;
    email: string;
  };
}

export function AccountMenu({ user }: AccountMenuProps) {
  const t = useT();
  const wide = useIsWide();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!wide || !open) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (wrapperRef.current && target instanceof Node && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [wide, open]);

  const signOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await apiSend<void>('/api/auth/logout', 'POST');
      queryClient.clear();
      navigate('/');
    } catch (err) {
      setError(err);
      setSigningOut(false);
    }
  };

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className="fsl-account-menu__trigger"
      aria-label={t('account.label')}
      title={t('account.label')}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((prev) => !prev)}
    >
      <Avatar name={user.name} size="sm" />
    </button>
  );

  const body = (
    <div className="fsl-account-menu__body">
      <div className="fsl-account-menu__identity">
        <p className="fsl-account-menu__name">{user.name}</p>
        <p className="fsl-account-menu__email">{user.email}</p>
      </div>

      <div className="fsl-account-menu__list">
        <Link
          to="/me/bank"
          className="fsl-account-menu__row fsl-account-menu__link"
          onClick={close}
        >
          <span className="fsl-account-menu__row-left">
            <Icon name="bank" size={20} />
            <span>{t('bankForm.title')}</span>
          </span>
          <Icon name="chevronRight" size={20} className="fsl-account-menu__chevron" />
        </Link>

        <div className="fsl-account-menu__row">
          <span>{t('account.language')}</span>
          <LanguageButton />
        </div>

        <Link
          to="/privacy"
          className="fsl-account-menu__row fsl-account-menu__link"
          onClick={close}
        >
          <span>{t('privacy.title')}</span>
          <Icon name="chevronRight" size={20} className="fsl-account-menu__chevron" />
        </Link>
      </div>

      {error !== null && (
        <InlineError error={error} className="fsl-account-menu__error" />
      )}

      <Button
        variant="secondary"
        block
        loading={signingOut}
        onClick={signOut}
        className="fsl-account-menu__sign-out"
      >
        {t('account.signOut')}
      </Button>
    </div>
  );

  if (wide) {
    return (
      <div className="fsl-account-menu" ref={wrapperRef}>
        {trigger}
        {open && (
          <div
            role="dialog"
            aria-label={t('account.label')}
            className="fsl-account-menu__popover"
          >
            {body}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {trigger}
      <Sheet open={open} onClose={close} title={t('account.label')}>
        {body}
      </Sheet>
    </>
  );
}
