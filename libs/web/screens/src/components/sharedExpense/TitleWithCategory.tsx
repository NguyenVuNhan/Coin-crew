import { useId, type JSX, type RefObject } from 'react';
import { fixedCategory, GENERAL_CATEGORY_KEY } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';
import { categoryIconName } from '../categoryIcon';

export interface TitleWithCategoryProps {
  title: string;
  onTitleChange(v: string): void;
  titleError?: string | null;
  categoryIcon: string;
  categoryLabel: string;
  onOpenCategory(): void;
  inputRef?: RefObject<HTMLInputElement | null>;
  inputId?: string;
}

const DEFAULT_ICON = fixedCategory(GENERAL_CATEGORY_KEY)?.icon ?? 'tag';

export function TitleWithCategory({
  title,
  onTitleChange,
  titleError,
  categoryIcon,
  categoryLabel,
  onOpenCategory,
  inputRef,
  inputId,
}: TitleWithCategoryProps): JSX.Element {
  const t = useT();
  const generatedId = useId();
  const id = inputId ?? generatedId;
  const resolvedIcon = categoryIconName(categoryIcon || DEFAULT_ICON, 'expense');

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-semibold text-muted-foreground px-1">
        {t('sharedExpense.titleLabel')}
      </Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="shared-category-btn"
          data-icon={resolvedIcon}
          aria-label={categoryLabel}
          title={categoryLabel}
          onClick={onOpenCategory}
          className="size-11 min-h-11 shrink-0 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center border-0 cursor-pointer hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name={resolvedIcon} size={20} />
        </button>
        <Input
          ref={inputRef}
          id={id}
          type="text"
          data-testid="shared-title-input"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('sharedExpense.titlePlaceholder')}
          maxLength={80}
          aria-invalid={titleError ? true : undefined}
          className={cn('fsl-input flex-1 text-base')}
        />
      </div>
      {titleError && (
        <p role="alert" className="fsl-field-error text-sm text-danger m-0 px-1">
          {titleError}
        </p>
      )}
    </div>
  );
}
