import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXED_CATEGORIES, GENERAL_CATEGORY_KEY, fixedCategory, type CategoryView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import {
  TitleWithCategory,
  DanhMucSheet,
  PayerSheet,
  SharedDetailsCard,
  NoteField,
} from '../sharedExpense';

beforeEach(() => setLang('vi', false));

describe('TitleWithCategory', () => {
  it('title button shows Chung icon when no danh mục', () => {
    const onOpenCategory = vi.fn();
    const onTitleChange = vi.fn();
    render(
      <TitleWithCategory
        title=""
        onTitleChange={onTitleChange}
        categoryIcon=""
        categoryLabel="Chọn danh mục"
        onOpenCategory={onOpenCategory}
      />,
    );

    const btn = screen.getByTestId('shared-category-btn');
    expect(btn).toHaveAttribute('aria-label', 'Chọn danh mục');
    expect(btn).toHaveAttribute('data-icon', fixedCategory(GENERAL_CATEGORY_KEY)!.icon);
    expect(btn.querySelector('svg')).not.toBeNull();

    fireEvent.click(btn);
    expect(onOpenCategory).toHaveBeenCalledTimes(1);

    const input = screen.getByTestId('shared-title-input');
    expect(input).toHaveClass('fsl-input');
    expect(input).toHaveAttribute('maxlength', '80');
    fireEvent.change(input, { target: { value: 'Ăn tối' } });
    expect(onTitleChange).toHaveBeenCalledWith('Ăn tối');
  });

  it('shows title error when provided', () => {
    render(
      <TitleWithCategory
        title=""
        onTitleChange={vi.fn()}
        titleError="Nhập tiêu đề"
        categoryIcon="utensils-crossed"
        categoryLabel="Ăn ngoài"
        onOpenCategory={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Nhập tiêu đề');
    expect(screen.getByTestId('shared-category-btn')).toHaveAttribute('data-icon', 'utensils-crossed');
  });
});

describe('DanhMucSheet', () => {
  it('DanhMucSheet groups fixed by parent and search filters by name', async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <DanhMucSheet open onClose={onClose} value={null} onChange={onChange} />,
    );

    const list = screen.getByTestId('danh-muc-list');
    const foodGroup = within(list).getByTestId('danh-muc-group-food');
    expect(within(foodGroup).getByText('Ăn uống')).toBeInTheDocument();
    expect(within(foodGroup).getByText('Ăn ngoài')).toBeInTheDocument();
    expect(within(foodGroup).getByText('Bia rượu')).toBeInTheDocument();

    const search = screen.getByTestId('danh-muc-search');
    await userEvent.type(search, 'an ngoai');

    expect(within(list).getByText('Ăn ngoài')).toBeInTheDocument();
    expect(within(list).queryByText('Di chuyển')).toBeNull();
    expect(within(list).queryByText('Bia rượu')).toBeNull();

    await userEvent.click(within(list).getByTestId('danh-muc-option-food-dining'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'fixed', key: 'food-dining' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Bỏ chọn row calls onChange(null)', async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <DanhMucSheet
        open
        onClose={onClose}
        value={{ kind: 'fixed', key: 'food-dining' }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByTestId('danh-muc-clear'));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('DanhMucSheet in groups ignores personal hidden flags', () => {
    render(
      <DanhMucSheet open onClose={vi.fn()} value={null} onChange={vi.fn()} />,
    );

    const list = screen.getByTestId('danh-muc-list');
    for (const cat of FIXED_CATEGORIES) {
      if (cat.type === 'expense') {
        expect(within(list).getByTestId(`danh-muc-option-${cat.key}`)).toBeInTheDocument();
      } else {
        expect(within(list).queryByTestId(`danh-muc-option-${cat.key}`)).toBeNull();
      }
    }
  });

  it('DanhMucSheet in Sổ chi tiêu hides the user\'s hidden fixed and adds customs', async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const personalCategories: CategoryView[] = [
      {
        id: 'u1:food',
        parentId: null,
        type: 'expense',
        name: 'Ăn uống',
        icon: 'utensils',
        hidden: false,
        sortOrder: 0,
        systemKey: 'food',
      },
      {
        id: 'u1:food-liquor',
        parentId: 'u1:food',
        type: 'expense',
        name: 'Bia rượu',
        icon: 'beer',
        hidden: true,
        sortOrder: 2,
        systemKey: 'food-liquor',
      },
      {
        id: 'custom-top',
        parentId: null,
        type: 'expense',
        name: 'Trà sữa',
        icon: 'coffee',
        hidden: false,
        sortOrder: 10,
        systemKey: null,
      },
      {
        id: 'custom-sub',
        parentId: 'u1:food',
        type: 'expense',
        name: 'Cà phê sáng',
        icon: 'coffee',
        hidden: false,
        sortOrder: 11,
        systemKey: null,
      },
      {
        id: 'custom-hidden',
        parentId: null,
        type: 'expense',
        name: 'Danh mục ẩn',
        icon: 'star',
        hidden: true,
        sortOrder: 12,
        systemKey: null,
      },
    ];

    render(
      <DanhMucSheet
        open
        onClose={onClose}
        value={null}
        onChange={onChange}
        personal={{ categories: personalCategories }}
      />,
    );

    const list = screen.getByTestId('danh-muc-list');
    expect(within(list).queryByTestId('danh-muc-option-food-liquor')).toBeNull();
    expect(within(list).queryByTestId('danh-muc-option-custom-hidden')).toBeNull();
    expect(within(list).getByTestId('danh-muc-option-food-dining')).toBeInTheDocument();
    expect(within(list).getByTestId('danh-muc-option-custom-top')).toHaveTextContent('Trà sữa');

    const foodGroup = within(list).getByTestId('danh-muc-group-food');
    expect(within(foodGroup).getByTestId('danh-muc-option-custom-sub')).toHaveTextContent('Cà phê sáng');

    await userEvent.click(within(list).getByTestId('danh-muc-option-custom-top'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'personal', id: 'custom-top' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PayerSheet', () => {
  it('PayerSheet marks me and calls onChange', async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <PayerSheet
        open
        onClose={onClose}
        people={[
          { id: 'p1', name: 'Minh' },
          { id: 'p2', name: 'An' },
        ]}
        me="p1"
        value="p1"
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('payer-option-p1')).toHaveTextContent('Minh (tôi)');
    expect(screen.getByTestId('payer-option-p2')).toHaveTextContent('An');

    await userEvent.click(screen.getByTestId('payer-option-p2'));
    expect(onChange).toHaveBeenCalledWith('p2');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SharedDetailsCard', () => {
  it('SharedDetailsCard always shows payer and date rows', () => {
    const onOpenPayer = vi.fn();
    const onDateChange = vi.fn();
    render(
      <SharedDetailsCard
        payerName="Nhân"
        onOpenPayer={onOpenPayer}
        date="2026-11-25"
        onDateChange={onDateChange}
        walletRow={<div data-testid="wallet-slot">Tiền mặt</div>}
      />,
    );

    const card = screen.getByTestId('shared-details-card');
    const payerRow = screen.getByTestId('shared-payer-row');
    expect(payerRow).toHaveTextContent('Người trả');
    expect(payerRow).toHaveTextContent('Nhân');
    fireEvent.click(payerRow);
    expect(onOpenPayer).toHaveBeenCalledTimes(1);

    const dateRow = screen.getByTestId('entry-date-row');
    expect(dateRow).toBeInTheDocument();
    expect(screen.queryByTestId('entry-time-picker')).toBeNull();
    fireEvent.change(screen.getByTestId('entry-date-picker'), { target: { value: '2026-11-20' } });
    expect(onDateChange).toHaveBeenCalledWith('2026-11-20');

    expect(card.lastElementChild).toBe(screen.getByTestId('wallet-slot'));
  });
});

describe('NoteField', () => {
  it('renders optional Nội dung input with maxLength 500', () => {
    const onChange = vi.fn();
    render(<NoteField value="Ghi chú" onChange={onChange} />);

    const input = screen.getByTestId('shared-note-input');
    expect(screen.getByLabelText('Nội dung')).toBe(input);
    expect(input).toHaveAttribute('maxlength', '500');
    fireEvent.change(input, { target: { value: 'Thêm chi tiết' } });
    expect(onChange).toHaveBeenCalledWith('Thêm chi tiết');
  });
});
