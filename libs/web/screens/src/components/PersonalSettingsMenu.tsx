import { useId, useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '@cc/web-i18n';
import { useBudgets } from '@cc/web-data-access/budgets';
import {
  useCategories,
  useGroupSettings,
  useUpdateGroupSettings,
} from '@cc/web-data-access/personalMoney';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { cn } from '@cc/web-ui/lib/utils';
import { CategoryPicker } from './CategoryPicker';

interface NavSettingItem {
  id: string;
  label: string;
  icon: IconName;
  to: string;
  count?: number;
}

export function PersonalSettingsMenu(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [categoryError, setCategoryError] = useState<unknown>(null);
  const [countLoansError, setCountLoansError] = useState<unknown>(null);

  const countLoansSwitchId = useId();
  const groupCategoryHintId = useId();
  const countLoansHintId = useId();

  const groupSettingsQuery = useGroupSettings({ enabled: open });
  const categoriesQuery = useCategories({ enabled: open || catOpen });
  const budgetsQuery = useBudgets({ enabled: open });
  const updateGroupSettings = useUpdateGroupSettings();
  const budgetsCount = budgetsQuery.data?.budgets.length ?? 0;

  const categories = categoriesQuery.data?.categories ?? [];
  const savedCategoryId = groupSettingsQuery.data?.settings.defaultGroupCategoryId ?? null;
  const savedCountLoans = groupSettingsQuery.data?.settings.countLoans ?? false;

  const categoryPending =
    updateGroupSettings.isPending &&
    updateGroupSettings.variables?.defaultGroupCategoryId !== undefined;
  const countLoansPending =
    updateGroupSettings.isPending && updateGroupSettings.variables?.countLoans !== undefined;

  const activeCategoryId = categoryPending
    ? (updateGroupSettings.variables?.defaultGroupCategoryId ?? null)
    : savedCategoryId;
  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null;

  // While a save is on its way the switch already shows what was asked for; a failed save puts it back.
  const countLoansChecked = countLoansPending
    ? Boolean(updateGroupSettings.variables?.countLoans)
    : savedCountLoans;

  const navItems: NavSettingItem[] = [
    {
      id: 'wallets',
      label: t('personalSettings.wallets'),
      icon: 'wallet',
      to: '/wallets',
    },
    {
      id: 'categories',
      label: t('personalSettings.categories'),
      icon: 'pie',
      to: '/personal/categories',
    },
    {
      id: 'assets',
      label: t('personalSettings.assets'),
      icon: 'coins',
      to: '/personal/assets',
    },
    {
      id: 'tags',
      label: t('personalSettings.tags'),
      icon: 'receipt',
      to: '/personal/tags',
    },
    {
      id: 'budgets',
      label: t('personalSettings.budgets'),
      icon: 'piggy-bank',
      to: '/budgets',
      count: budgetsCount > 0 ? budgetsCount : undefined,
    },
  ];

  const handleSelectCategory = (categoryId: string) => {
    setCategoryError(null);
    setCatOpen(false);
    updateGroupSettings.mutate(
      { defaultGroupCategoryId: categoryId },
      {
        onError: (err) => setCategoryError(err),
      },
    );
  };

  const handleToggleCountLoans = (checked: boolean) => {
    setCountLoansError(null);
    updateGroupSettings.mutate(
      { countLoans: checked },
      {
        onError: (err) => setCountLoansError(err),
      },
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label={t('personalSettings.title')}
        title={t('personalSettings.title')}
        data-testid="personal-settings-btn"
        onClick={() => setOpen(true)}
        className="fsl-personal-settings__btn size-11 inline-flex items-center justify-center rounded-full text-foreground bg-transparent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 transition-colors motion-reduce:transition-none cursor-pointer border-0 p-0"
      >
        <Icon name="settings" size={20} />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('personalSettings.title')}
      >
        <div
          className={cn(
            'fsl-personal-settings__list bg-card rounded-xl border border-border divide-y divide-border overflow-hidden',
          )}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`personal-settings-${item.id}`}
              className="fsl-action-sheet__action fsl-action-sheet__action--default flex items-center justify-between gap-3 w-full min-h-12 px-4 py-3 text-left font-medium text-base text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer bg-transparent border-0"
              onClick={() => {
                setOpen(false);
                navigate(item.to);
              }}
            >
              <span className="inline-flex items-center gap-3 min-w-0">
                <Icon name={item.icon} size={20} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="inline-flex items-center gap-1 shrink-0">
                {item.count !== undefined && (
                  <span
                    data-testid={`personal-settings-${item.id}-count`}
                    className="text-sm text-muted-foreground tabular-nums"
                  >
                    {item.count}
                  </span>
                )}
                <Icon name="chevronRight" size={20} className="text-muted-foreground shrink-0" />
              </span>
            </button>
          ))}

          <div>
            <button
              type="button"
              data-testid="personal-settings-group-category"
              aria-describedby={groupCategoryHintId}
              disabled={categoryPending}
              onClick={() => setCatOpen(true)}
              className="fsl-personal-settings__row flex items-center justify-between gap-3 w-full min-h-12 px-4 py-3 text-left text-base text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer bg-transparent border-0 disabled:opacity-50"
            >
              <span className="flex items-start gap-3 min-w-0">
                <Icon name="users" size={20} className="shrink-0 mt-0.5" />
                <span className="flex flex-col min-w-0">
                  <span className="font-medium leading-snug">{t('settings.groupCategory')}</span>
                  <span
                    id={groupCategoryHintId}
                    className="text-sm text-muted-foreground leading-normal"
                  >
                    {t('settings.groupCategoryHint')}
                  </span>
                </span>
              </span>
              <span className="inline-flex items-center gap-1 shrink-0">
                {activeCategory && (
                  <span
                    data-testid="personal-settings-group-category-value"
                    className="text-sm text-muted-foreground"
                  >
                    {activeCategory.name}
                  </span>
                )}
                <Icon name="chevronRight" size={20} className="text-muted-foreground shrink-0" />
              </span>
            </button>
            {categoryError ? (
              <InlineError
                error={categoryError}
                className="fsl-personal-settings__group-category-error mx-3 mb-2"
              />
            ) : null}
          </div>

          <div>
            <div className="fsl-personal-settings__row flex items-center justify-between gap-3 min-h-12 px-4 py-3 text-base text-foreground">
              <div className="flex items-start gap-3 min-w-0">
                <Icon name="swap" size={20} className="shrink-0 mt-0.5" />
                <div className="flex flex-col min-w-0">
                  <Label
                    htmlFor={countLoansSwitchId}
                    className="font-medium text-foreground text-base leading-snug cursor-pointer"
                  >
                    {t('settings.countLoans')}
                  </Label>
                  <p
                    id={countLoansHintId}
                    className="m-0 text-sm text-muted-foreground leading-normal"
                  >
                    {t('settings.countLoansHint')}
                  </p>
                </div>
              </div>
              <Switch
                id={countLoansSwitchId}
                data-testid="personal-settings-count-loans"
                checked={countLoansChecked}
                aria-describedby={countLoansHintId}
                onCheckedChange={handleToggleCountLoans}
                disabled={countLoansPending}
              />
            </div>
            {countLoansError ? (
              <InlineError
                error={countLoansError}
                className="fsl-personal-settings__count-loans-error mx-3 mb-2"
              />
            ) : null}
          </div>
        </div>
      </Sheet>

      <Sheet
        open={catOpen}
        onClose={() => setCatOpen(false)}
        title={t('settings.groupCategory')}
      >
        <CategoryPicker
          type="expense"
          categories={categories}
          recentIds={[]}
          value={activeCategoryId}
          onChange={handleSelectCategory}
        />
      </Sheet>
    </>
  );
}
