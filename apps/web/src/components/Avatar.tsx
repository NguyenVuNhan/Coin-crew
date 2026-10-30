import { cn } from '@/lib/utils';

export interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function avatarTone(name: string): 1 | 2 | 3 | 4 | 5 | 6 {
  const trimmed = name.trim();
  let sum = 0;
  for (let i = 0; i < trimmed.length; i++) {
    sum += trimmed.charCodeAt(i);
  }
  return ((sum % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
}

const TONES: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'bg-avatar-1 text-avatar-1-fg',
  2: 'bg-avatar-2 text-avatar-2-fg',
  3: 'bg-avatar-3 text-avatar-3-fg',
  4: 'bg-avatar-4 text-avatar-4-fg',
  5: 'bg-avatar-5 text-avatar-5-fg',
  6: 'bg-avatar-6 text-avatar-6-fg',
};

export function Avatar({ name, avatarUrl, size = 'md', className = '' }: AvatarProps) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] ?? '';
  const initial = lastWord.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'fsl-avatar',
        `fsl-avatar--${size}`,
        avatarUrl && 'fsl-avatar--has-img',
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        size === 'sm' ? 'size-7 text-xs' : 'size-9 text-sm',
        avatarUrl ? 'bg-muted' : TONES[avatarTone(name)],
        className,
      )}
      aria-hidden="true"
    >
      {avatarUrl ? (
        <img className="fsl-avatar__img size-full object-cover" src={avatarUrl} alt="" />
      ) : (
        initial
      )}
    </div>
  );
}
