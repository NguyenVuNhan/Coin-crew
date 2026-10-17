import './Avatar.css';

export interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ name, avatarUrl, size = 'md', className = '' }: AvatarProps) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] ?? '';
  const initial = lastWord.charAt(0).toUpperCase();

  return (
    <div
      className={`fsl-avatar fsl-avatar--${size} ${className}`.trim()}
      aria-hidden="true"
    >
      {avatarUrl ? (
        <img className="fsl-avatar__img" src={avatarUrl} alt="" />
      ) : (
        initial
      )}
    </div>
  );
}
