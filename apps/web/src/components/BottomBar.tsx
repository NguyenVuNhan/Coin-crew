import type { ReactNode } from 'react';
import './BottomBar.css';

export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fsl-bottom-bar">
      <div className="fsl-bottom-bar__inner">{children}</div>
    </div>
  );
}
