import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MeUserView, Gender } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { useIsWide } from '../lib/media';
import { apiSend } from '../api/client';
import { useMe } from '../api/hooks';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { LanguageButton } from './LanguageButton';
import { InlineError } from './InlineError';
import { Button } from './Button';
import { Icon } from './icons';
import { AvatarCropModal } from './AvatarCropModal';
import { LinkedAccounts } from './LinkedAccounts';
import { MergeRequestBanner } from './MergeRequestBanner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  /** 'sheet' opens the drawer on every screen size (the side panel sits at the bottom, with no room for a popover). */
  variant?: 'auto' | 'sheet';
}

export function AccountMenu({ user: propUser, variant = 'auto' }: AccountMenuProps = {}) {
  const t = useT();
  const isWide = useIsWide();
  const wide = isWide && variant !== 'sheet';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const meQuery = useMe({ enabled: propUser === undefined });

  const u = propUser !== undefined ? propUser : meQuery.data?.user;
  const incomingMerge = meQuery.data?.mergeRequests.incoming[0];

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
      className={cn(
        'fsl-account-menu__trigger relative inline-flex items-center justify-center size-11 rounded-full bg-transparent hover:bg-muted transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      aria-label={t('trips.accountAria', { name: u.name })}
      title={t('account.label')}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((prev) => !prev)}
    >
      <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
      {incomingMerge && (
        <span
          className="fsl-account-menu__dot absolute top-1.5 right-1.5 size-2.5 rounded-full bg-danger ring-2 ring-card"
          role="img"
          aria-label={t('merge.dot')}
        />
      )}
    </button>
  );

  const body = (
    <div className="fsl-account-menu__body flex flex-col gap-3">
      <div className="fsl-account-menu__identity m-0">
        <div className="fsl-account-menu__avatar-row flex items-center gap-3 mb-2">
          <Avatar name={u.name} avatarUrl={u.avatarUrl} size="md" />
          <div className="fsl-account-menu__photo-actions flex flex-col gap-1">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoFileChange}
            />
            <button
              type="button"
              className="fsl-account-menu__photo-btn inline-flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="camera" size={16} />
              <span>{t('account.changePhoto')}</span>
            </button>
            {u.avatarUrl && (
              <button
                type="button"
                className="fsl-account-menu__photo-btn fsl-account-menu__photo-btn--remove inline-flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-danger hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
                onClick={handleRemovePhoto}
              >
                {t('account.removePhoto')}
              </button>
            )}
          </div>
        </div>

        <div className="fsl-account-menu__info flex flex-col">
          <p className="fsl-account-menu__name m-0 text-base font-semibold text-foreground leading-normal">{u.name}</p>
          <p className="fsl-account-menu__email m-0 mt-1 text-sm text-muted-foreground break-all leading-normal">
            {u.email ?? t('account.zaloAccount')}
          </p>
        </div>
      </div>

      <div className="fsl-account-menu__profile-form flex flex-col gap-3 m-0 p-3 bg-muted rounded-xl">
        <div className="fsl-form-group flex flex-col gap-1.5">
          <Label htmlFor="fsl-account-name-input" className="fsl-form-label text-foreground">
            {t('account.displayName')}
          </Label>
          <Input
            id="fsl-account-name-input"
            type="text"
            className="fsl-input"
            aria-label={t('account.displayName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div className="fsl-account-menu__gender-group flex flex-col gap-1.5">
          <span className="fsl-form-label text-sm font-medium text-foreground">{t('account.gender')}</span>
          <div className="fsl-account-menu__gender-toggle flex gap-2" role="radiogroup" aria-label={t('account.gender')}>
            <button
              type="button"
              role="radio"
              aria-checked={gender === 'M'}
              className={cn(
                'fsl-account-menu__gender-btn flex-1 inline-flex items-center justify-center gap-1 min-h-11 px-2 border rounded-xl text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                gender === 'M'
                  ? 'fsl-account-menu__gender-btn--selected bg-card text-foreground font-semibold shadow-sm border-border'
                  : 'bg-card/50 text-muted-foreground border-transparent hover:text-foreground hover:bg-card',
              )}
              onClick={() => setGender(gender === 'M' ? null : 'M')}
            >
              <Icon name="mars" size={16} />
              <span>{t('people.genderMale')}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={gender === 'F'}
              className={cn(
                'fsl-account-menu__gender-btn flex-1 inline-flex items-center justify-center gap-1 min-h-11 px-2 border rounded-xl text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                gender === 'F'
                  ? 'fsl-account-menu__gender-btn--selected bg-card text-foreground font-semibold shadow-sm border-border'
                  : 'bg-card/50 text-muted-foreground border-transparent hover:text-foreground hover:bg-card',
              )}
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
          className="fsl-account-menu__save-profile mt-1"
        >
          {t('account.saveProfile')}
        </Button>
      </div>

      {incomingMerge && <MergeRequestBanner request={incomingMerge} />}

      {meQuery.data && <LinkedAccounts me={meQuery.data} />}

      <div className="fsl-account-menu__list flex flex-col border border-border rounded-xl p-1 bg-card">
        <Link
          to="/me/bank"
          className={cn(
            'fsl-account-menu__row fsl-account-menu__link flex items-center justify-between min-h-11 rounded-lg px-3 text-base text-foreground hover:bg-accent transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          onClick={close}
        >
          <span className="fsl-account-menu__row-left inline-flex items-center gap-2">
            <Icon name="bank" size={20} />
            <span>{t('bankForm.title')}</span>
          </span>
          <Icon name="chevronRight" size={20} className="fsl-account-menu__chevron text-muted-foreground shrink-0" />
        </Link>

        <div className="fsl-account-menu__row flex items-center justify-between min-h-11 rounded-lg px-3 text-base text-foreground">
          <span>{t('account.language')}</span>
          <LanguageButton />
        </div>

        <Link
          to="/privacy"
          className={cn(
            'fsl-account-menu__row fsl-account-menu__link flex items-center justify-between min-h-11 rounded-lg px-3 text-base text-foreground hover:bg-accent transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          onClick={close}
        >
          <span>{t('privacy.title')}</span>
          <Icon name="chevronRight" size={20} className="fsl-account-menu__chevron text-muted-foreground shrink-0" />
        </Link>
      </div>

      {error !== null && (
        <InlineError error={error} className="fsl-account-menu__error m-0" />
      )}

      <Button
        variant="secondary"
        block
        loading={signingOut}
        onClick={signOut}
        className="fsl-account-menu__sign-out m-0"
      >
        {t('trips.signOut')}
      </Button>
    </div>
  );

  const cropModal = cropOpen && cropSrc ? (
    <AvatarCropModal
      open={cropOpen}
      imageSrc={cropSrc}
      onSave={handleSaveCroppedPhoto}
      onCancel={() => setCropOpen(false)}
    />
  ) : null;

  if (wide) {
    return (
      <div className="fsl-account-menu relative inline-flex" ref={wrapperRef}>
        {trigger}
        {open && !cropOpen && (
          <div
            role="dialog"
            aria-label={t('account.label')}
            className="fsl-account-menu__popover absolute top-full mt-2 right-0 w-[348px] max-w-[calc(100vw-2rem)] p-2 bg-card rounded-xl shadow-lg border border-border z-30 box-border"
          >
            {body}
          </div>
        )}
        {cropModal}
      </div>
    );
  }

  return (
    <span className="fsl-account-menu inline-flex">
      {trigger}
      <Sheet open={open && !cropOpen} onClose={close} title={t('account.label')}>
        {body}
      </Sheet>
      {cropModal}
    </span>
  );
}
