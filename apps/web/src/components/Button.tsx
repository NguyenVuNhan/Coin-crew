import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface BaseButtonProps {
  variant?: ButtonVariant;
  block?: boolean;
  loading?: boolean;
  href?: string;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = BaseButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseButtonProps> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseButtonProps>;

/** A path inside this app (the router handles it). Server routes under /api and other sites need a real page load. */
function isInAppPath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/');
}

export function Button({
  variant = 'primary',
  block = false,
  loading = false,
  href,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'fsl-button',
    `fsl-button--${variant}`,
    block ? 'fsl-button--block' : '',
    disabled || loading ? 'fsl-button--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (href !== undefined && isInAppPath(href)) {
    return (
      <Link
        to={href}
        className={classes}
        aria-busy={loading ? 'true' : undefined}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }

  if (href !== undefined) {
    return (
      <a
        href={href}
        className={classes}
        aria-busy={loading ? 'true' : undefined}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={classes}
      aria-busy={loading ? 'true' : undefined}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}
