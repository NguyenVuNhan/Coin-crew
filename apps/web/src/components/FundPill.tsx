import { useState, Fragment } from 'react';
import { Link } from 'react-router';
import { formatVnd, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { fundOf, isFundAdmin, showFund } from '../lib/fund';
import './FundPill.css';

/** Flat bar showing the group fund balance and opening the fund sheet (spec §7.5). */
export function FundPill({ view }: { view: TripView }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!showFund(view)) {
    return null;
  }

  const fund = fundOf(view);
  if (!fund) {
    return null;
  }

  const { balance, added, spent } = fund;
  const keepers = view.people.filter((p) => p.isAdmin || p.isOrganiser);

  const balanceModifier =
    balance === 0
      ? ' fsl-fund-pill__balance--zero'
      : balance < 0
        ? ' fsl-fund-pill__balance--negative'
        : '';

  const sheetBalanceModifier =
    balance === 0
      ? ' fsl-fund-sheet__balance--zero'
      : balance < 0
        ? ' fsl-fund-sheet__balance--negative'
        : '';

  return (
    <>
      <button
        type="button"
        className="fsl-fund-pill"
        onClick={() => setOpen(true)}
        aria-label={t('fund.pillLabel', { amount: formatVnd(balance) })}
      >
        <Icon name="piggyBank" size={20} className="fsl-fund-pill__icon" />
        <span className="fsl-fund-pill__title">{t('fund.title')}</span>
        <span className={`fsl-fund-pill__balance${balanceModifier}`}>
          {formatVnd(balance)}
        </span>
        <Icon name="chevronRight" size={16} className="fsl-fund-pill__chevron" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('fund.title')}>
        <div className="fsl-fund-sheet">
          <p className={`fsl-fund-sheet__balance${sheetBalanceModifier}`}>
            {formatVnd(balance)}
          </p>

          {balance !== 0 ? (
            <dl className="fsl-fund-sheet__stats">
              <div className="fsl-fund-sheet__stat-row">
                <dt className="fsl-fund-sheet__stat-label">{t('fund.added')}</dt>
                <dd className="fsl-fund-sheet__stat-value fsl-fund-sheet__stat-value--added">
                  {`+${formatVnd(added)}`}
                </dd>
              </div>
              <div className="fsl-fund-sheet__stat-row">
                <dt className="fsl-fund-sheet__stat-label">{t('fund.spent')}</dt>
                <dd className="fsl-fund-sheet__stat-value fsl-fund-sheet__stat-value--spent">
                  {formatVnd(-spent)}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="fsl-fund-sheet__empty">
              <Icon name="piggyBank" size={24} className="fsl-fund-sheet__empty-icon" />
              <p className="fsl-fund-sheet__empty-title">{t('fund.emptyTitle')}</p>
              <p className="fsl-fund-sheet__empty-body">{t('fund.emptyBody')}</p>
            </div>
          )}

          <div className="fsl-fund-sheet__keepers">
            <span className="fsl-fund-sheet__keepers-label">{t('fund.keptBy')}</span>
            <p className="fsl-fund-sheet__keepers-line">
              {keepers.map((person, index) => (
                <Fragment key={person.id}>
                  <span className="fsl-fund-sheet__keeper-name">{person.name}</span>
                  {index < keepers.length - 1 ? ', ' : ''}
                </Fragment>
              ))}
            </p>
          </div>

          <p className="fsl-fund-sheet__footnote">{t('fund.adminsOnly')}</p>

          {isFundAdmin(view) && (
            <Link
              to={`/t/${view.trip.id}/expenses/new?type=income`}
              className="fsl-button fsl-button--primary fsl-button--block"
            >
              {t('fund.add')}
            </Link>
          )}
        </div>
      </Sheet>
    </>
  );
}
