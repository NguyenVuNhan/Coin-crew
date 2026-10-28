import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
  dismissible = true,
}: ModalProps) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
      title={title}
      dismissible={dismissible && typeof onClose === 'function'}
      className={cn('fsl-modal', className)}
    >
      {children}
    </ResponsiveSheet>
  );
}
