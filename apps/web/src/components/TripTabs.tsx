import { useT } from '../i18n';
import './TripTabs.css';

export interface TripTabsProps {
  activeTab: 'expenses' | 'payments';
  onChange: (tab: 'expenses' | 'payments') => void;
}

export function TripTabs({ activeTab, onChange }: TripTabsProps) {
  const t = useT();

  return (
    <div className="fsl-trip-tabs" role="tablist" aria-label={t('trip.tabs')}>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'expenses'}
        className={`fsl-trip-tab${activeTab === 'expenses' ? ' fsl-trip-tab--active' : ''}`}
        onClick={() => onChange('expenses')}
      >
        {t('trip.tabExpenses')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'payments'}
        className={`fsl-trip-tab${activeTab === 'payments' ? ' fsl-trip-tab--active' : ''}`}
        onClick={() => onChange('payments')}
      >
        {t('trip.tabPayments')}
      </button>
    </div>
  );
}
