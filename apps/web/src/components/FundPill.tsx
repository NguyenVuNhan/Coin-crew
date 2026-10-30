import { useState, Fragment } from 'react';
import { formatVnd, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { Button } from './Button';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { fundOf, isFundAdmin, showFund } from '../lib/fund';
import { cn } from '@/lib/utils';

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

  return (
    <>
      <button
        type="button"
        className={cn(
          'fsl-fund-pill w-full min-h-12 flex items-center gap-3 px-4 rounded-full bg-card border border-border shadow-none text-left font-inherit cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring box-border',
        )}
        onClick={() => setOpen(true)}
        aria-label={t('fund.pillLabel', { amount: formatVnd(balance) })}
      >
        <Icon name="piggyBank" size={20} className="fsl-fund-pill__icon text-muted-foreground shrink-0" />
        <span className="fsl-fund-pill__title flex-1 min-w-0 text-base font-semibold text-foreground truncate">{t('fund.title')}</span>
        <span
          className={cn(
            'fsl-fund-pill__balance text-base font-semibold tabular-nums shrink-0',
            balance === 0
              ? 'fsl-fund-pill__balance--zero text-muted-foreground'
              : balance < 0
                ? 'fsl-fund-pill__balance--negative text-danger'
                : 'text-foreground',
          )}
        >
          {formatVnd(balance)}
        </span>
        <Icon name="chevronRight" size={16} className="fsl-fund-pill__chevron text-muted-foreground shrink-0" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('fund.title')}>
        <div className="fsl-fund-sheet flex flex-col gap-4 text-left">
          <p
            className={cn(
              'fsl-fund-sheet__balance m-0 text-2xl font-bold tabular-nums',
              balance === 0
                ? 'fsl-fund-sheet__balance--zero text-subtle-foreground'
                : balance < 0
                  ? 'fsl-fund-sheet__balance--negative text-danger'
                  : 'text-foreground',
            )}
          >
            {formatVnd(balance)}
          </p>

          {balance !== 0 ? (
            <dl className="fsl-fund-sheet__stats m-0 p-0 flex flex-col">
              <div className="fsl-fund-sheet__stat-row flex items-center justify-between min-h-11 border-b border-border">
                <dt className="fsl-fund-sheet__stat-label m-0 text-base text-foreground">{t('fund.added')}</dt>
                <dd className="fsl-fund-sheet__stat-value fsl-fund-sheet__stat-value--added m-0 text-base font-medium tabular-nums text-right text-success">
                  {`+${formatVnd(added)}`}
                </dd>
              </div>
              <div className="fsl-fund-sheet__stat-row flex items-center justify-between min-h-11">
                <dt className="fsl-fund-sheet__stat-label m-0 text-base text-foreground">{t('fund.spent')}</dt>
                <dd className="fsl-fund-sheet__stat-value fsl-fund-sheet__stat-value--spent m-0 text-base font-medium tabular-nums text-right text-foreground">
                  {formatVnd(-spent)}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="fsl-fund-sheet__empty flex flex-col items-start gap-2">
              <Icon name="piggyBank" size={24} className="fsl-fund-sheet__empty-icon text-muted-foreground" />
              <p className="fsl-fund-sheet__empty-title m-0 text-base font-semibold text-foreground">{t('fund.emptyTitle')}</p>
              <p className="fsl-fund-sheet__empty-body m-0 text-sm text-muted-foreground">{t('fund.emptyBody')}</p>
            </div>
          )}

          <div className="fsl-fund-sheet__keepers flex flex-col gap-1">
            <span className="fsl-fund-sheet__keepers-label text-xs font-medium text-muted-foreground">{t('fund.keptBy')}</span>
            <p className="fsl-fund-sheet__keepers-line m-0 text-base font-medium text-foreground break-words">
              {keepers.map((person, index) => (
                <Fragment key={person.id}>
                  <span className="fsl-fund-sheet__keeper-name text-foreground font-medium">{person.name}</span>
                  {index < keepers.length - 1 ? ', ' : ''}
                </Fragment>
              ))}
            </p>
          </div>

          <p className="fsl-fund-sheet__footnote m-0 text-sm text-muted-foreground">{t('fund.adminsOnly')}</p>

          {isFundAdmin(view) && (
            <Button
              href={`/t/${view.trip.id}/expenses/new?type=income`}
              variant="primary"
              block
              className="mt-2"
            >
              {t('fund.add')}
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}
