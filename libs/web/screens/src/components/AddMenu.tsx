import { useState, type JSX, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { useT } from '@cc/web-i18n';
import { useWalletDetails } from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@cc/web-ui/components/ui/popover';

export interface AddMenuProps {
  addHref: string;
  align: 'start' | 'end';
  side: 'top' | 'bottom';
  variant: 'fab' | 'button';
}

const ITEM_CLASS =
  'min-h-11 rounded-xl flex items-center gap-3 px-3 text-sm font-medium text-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors no-underline';

export function AddMenu({ addHref, align, side, variant }: AddMenuProps): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const walletsQuery = useWalletDetails();
  const activeCount = (walletsQuery.data?.wallets ?? []).filter((w) => !w.archived).length;
  const canTransfer = activeCount >= 2;

  const close = () => setOpen(false);
  const handleFabClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setOpen((prev) => !prev);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === 'fab' ? (
          <Link
            to={addHref}
            onClick={handleFabClick}
            data-testid="nav-add"
            aria-label={t('nav.add')}
            className="pointer-events-auto size-14 rounded-full bg-foreground text-background shadow-lg inline-flex items-center justify-center text-3xl font-light hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity shrink-0 leading-none select-none"
          >
            +
          </Link>
        ) : (
          <Button
            variant="primary"
            block
            data-testid="nav-add"
            className="mb-2"
          >
            + {t('nav.add')}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} side={side} sideOffset={8} className="w-56 p-1.5 gap-1 rounded-2xl">
        <Link
          to="/entries/new?type=expense"
          data-testid="add-menu-expense"
          onClick={close}
          className={ITEM_CLASS}
        >
          <Icon name="receipt" size={18} />
          <span>{t('addMenu.expense')}</span>
        </Link>
        <Link
          to="/entries/new?type=income"
          data-testid="add-menu-income"
          onClick={close}
          className={ITEM_CLASS}
        >
          <Icon name="wallet" size={18} />
          <span>{t('addMenu.income')}</span>
        </Link>
        {canTransfer && (
          <Link
            to="/entries/new?type=transfer"
            data-testid="add-menu-transfer"
            onClick={close}
            className={ITEM_CLASS}
          >
            <Icon name="swap" size={18} />
            <span>{t('addMenu.transfer')}</span>
          </Link>
        )}
        <Link
          to={addHref}
          data-testid="add-menu-with-people"
          onClick={close}
          className={ITEM_CLASS}
        >
          <Icon name="users" size={18} />
          <span>{t('addMenu.withPeople')}</span>
        </Link>
      </PopoverContent>
    </Popover>
  );
}
