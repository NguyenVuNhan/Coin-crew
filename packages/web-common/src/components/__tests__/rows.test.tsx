import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import type { ExpenseView } from '@fsl/core';
import { renderAt } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { ExpenseRow } from '../ExpenseRow';

/** A long Vietnamese description and a big amount, all on Minh: the row must not wrap the amount or push it off. */
const homestay: ExpenseView = {
  id: 'e-long', description: 'Nguyễn Thị Phương Thảo trả tiền homestay 2 đêm', amount: 1250000000, spentOn: '2026-10-11',
  payerId: PIDS.M, mode: 'equal', status: 'approved', rejectReason: null, disabledByName: null, createdById: PIDS.M,
  shares: [{ participantId: PIDS.M, amount: 1250000000, inputValue: 1 }],
};

describe('Friendly rows', () => {
  it('long name truncates and the amount stays whole', () => {
    renderAt(<ExpenseRow expense={homestay} view={tripView({ expenses: [homestay] })} />);
    expect(screen.getByText(homestay.description)).toHaveClass('truncate');
    const amount = screen.getByText('1.250.000.000₫');
    expect(amount).toHaveClass('whitespace-nowrap', 'tabular-nums');
    expect(amount.closest('.fsl-expense-row__right')).toHaveClass('shrink-0');
  });
});
