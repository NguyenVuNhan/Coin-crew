import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeUserView, Gender } from '@fsl/core';
import { useT } from '../i18n';
import { useIsWide } from '../lib/media';
import { apiFetch, apiSend } from '../api/client';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { LanguageButton } from './LanguageButton';
import { InlineError } from './InlineError';
import { Button } from './Button';
import { Icon } from './icons';
import { AvatarCropModal } from './AvatarCropModal';
import './AccountMenu.css';

export type AccountMenuUser = {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  gender?: Gender | null;
  id?: string;
  consentAt?: string | null;
};

export interface AccountMenuProps {
  user?: AccountMenuUser | MeUserView | null;
}

export function AccountMenu({ user: propUser }: AccountMenuProps = {}) {
  const t = useT();
  const wide = useIsWide();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const meQuery = useQuery<{ user: MeUserView | null }>({
    queryKey: ['me'],
    queryFn: () => apiFetch<{ user: MeUserView | null }>('/api/me'),
    enabled: propUser === undefined,
  });

  const u = propUser !== undefined ? propUser : meQuery.data?.user;

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (u) {
      setDisplayName(u.name ?? '');
      setGender(u.gender ?? null);
    }
  }, [u?.name, u?.gender]);

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

  if (!u) {
    return null;
  }

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

  const handlePhotoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropSrc(reader.result);
        setCropOpen(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveCroppedPhoto = async (croppedDataUrl: string) => {
    setCropOpen(false);
    setError(null);
    try {
      await apiSend('/api/me', 'PATCH', { avatarUrl: croppedDataUrl });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['trips'] }),
        queryClient.invalidateQueries({ queryKey: ['trip'] }),
      ]);
    } catch (err) {
      setError(err);
    }
  };

  const handleRemovePhoto = async () => {
    setError(null);
    try {
      await apiSend('/api/me', 'PATCH', { avatarUrl: null });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['trips'] }),
        queryClient.invalidateQueries({ queryKey: ['trip'] }),
      ]);
    } catch (err) {
      setError(err);
    }
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) return;
    setSavingProfile(true);
    setError(null);
    try {
      await apiSend('/api/me', 'PATCH', {
        name: displayName.trim(),
        gender,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['trips'] }),
        queryClient.invalidateQueries({ queryKey: ['trip'] }),
      ]);
    } catch (err) {
      setError(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className="fsl-account-menu__trigger"
      aria-label={t('trips.accountAria', { name: u.name })}
      title={t('account.label')}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((prev) => !prev)}
    >
      <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
    </button>
  );

  const body = (
    <div className="fsl-account-menu__body">
      <div className="fsl-account-menu__identity">
        <div className="fsl-account-menu__avatar-row">
          <Avatar name={u.name} avatarUrl={u.avatarUrl} size="md" />
          <div className="fsl-account-menu__photo-actions">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoFileChange}
            />
            <button
              type="button"
              className="fsl-account-menu__photo-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="camera" size={16} />
              <span>{t('account.changePhoto')}</span>
            </button>
            {u.avatarUrl && (
              <button
                type="button"
                className="fsl-account-menu__photo-btn fsl-account-menu__photo-btn--remove"
                onClick={handleRemovePhoto}
              >
                {t('account.removePhoto')}
              </button>
            )}
          </div>
        </div>

        <div className="fsl-account-menu__info">
          <p className="fsl-account-menu__name">{u.name}</p>
          <p className="fsl-account-menu__email">{u.email}</p>
        </div>
      </div>

      <div className="fsl-account-menu__profile-form">
        <div className="fsl-form-group">
          <label htmlFor="fsl-account-name-input" className="fsl-form-label">
            {t('account.displayName')}
          </label>
          <input
            id="fsl-account-name-input"
            type="text"
            className="fsl-input"
            aria-label={t('account.displayName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div className="fsl-account-menu__gender-group">
          <span className="fsl-form-label">{t('account.gender')}</span>
          <div className="fsl-account-menu__gender-toggle" role="radiogroup" aria-label={t('account.gender')}>
            <button
              type="button"
              role="radio"
              aria-checked={gender === 'M'}
              className={`fsl-account-menu__gender-btn${gender === 'M' ? ' fsl-account-menu__gender-btn--selected' : ''}`}
              onClick={() => setGender(gender === 'M' ? null : 'M')}
            >
              <Icon name="mars" size={16} />
              <span>{t('people.genderMale')}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={gender === 'F'}
              className={`fsl-account-menu__gender-btn${gender === 'F' ? ' fsl-account-menu__gender-btn--selected' : ''}`}
              onClick={() => setGender(gender === 'F' ? null : 'F')}
            >
              <Icon name="venus" size={16} />
              <span>{t('people.genderFemale')}</span>
            </button>
          </div>
        </div>

        <Button
          variant="primary"
          block
          loading={savingProfile}
          disabled={!displayName.trim() || savingProfile}
          onClick={handleSaveProfile}
          className="fsl-account-menu__save-profile"
        >
          {t('account.saveProfile')}
        </Button>
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
        {t('trips.signOut')}
      </Button>

      {cropOpen && cropSrc && (
        <AvatarCropModal
          open={cropOpen}
          imageSrc={cropSrc}
          onSave={handleSaveCroppedPhoto}
          onCancel={() => setCropOpen(false)}
        />
      )}
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
