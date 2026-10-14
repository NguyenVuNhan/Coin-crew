import type { ReactNode } from 'react';
import './TripLayout.css';

/** Layout A: the trip's lists on the left, a sticky panel on the right (from 1024px). */
export function TripLayout({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="fsl-trip-layout">
      <div className="fsl-trip-layout__main">{left}</div>
      <div className="fsl-trip-layout__side">{right}</div>
    </div>
  );
}
