import { useT } from '../i18n';
import type { ListMode } from '../lib/useListMode';
import './ListModeChip.css';

/** The "Show all" / "Show mine" chip next to a section title; same look as the one in Your transfers. */
export function ListModeChip({ mode, onToggle }: { mode: ListMode; onToggle(): void }) {
  const t = useT();
  return (
    <button type="button" className="fsl-list-chip" onClick={onToggle}>
      <span className="fsl-list-chip__pill">{mode === 'mine' ? t('transfers.showAll') : t('transfers.showMine')}</span>
    </button>
  );
}
