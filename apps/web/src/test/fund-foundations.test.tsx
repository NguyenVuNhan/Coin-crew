import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ActivityAction } from '@fsl/core';
import { en } from '../i18n/en';
import { vi as viMessages } from '../i18n/vi';
import viSource from '../i18n/vi.ts?raw';
import { t } from '../i18n';
import { Icon } from '../components/icons';
import { InlineError } from '../components/InlineError';
import { activityLine } from '../lib/activityText';
import { renderAt } from './render';

describe('group fund foundations', () => {
  it('Vietnamese still has exactly the English keys', () => expect(Object.keys(viMessages).sort()).toEqual(Object.keys(en).sort()));

  it('new Vietnamese fund lines are marked for review', () => {
    for (const key of ['entry.income', 'fund.title', 'fund.overLimit', 'error.fundShort']) {
      expect(viSource.split('\n').find((l) => l.includes(`'${key}'`))).toMatch(/\/\/ REVIEW$/);
    }
  });

  it('renders the piggyBank icon', () => {
    const { container } = render(<Icon name="piggyBank" />);
    expect(container.querySelector('svg')?.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('InlineError explains FUND_SHORT', () => {
    renderAt(<InlineError error={{ code: 'FUND_SHORT' }} />);
    expect(screen.getByText("There isn't enough in the group fund for this. Check the fund and try again.")).toBeInTheDocument();
  });

  it('activity lines for income and fund-paid expenses', () => {
    const item = (action: ActivityAction, details: Record<string, unknown>) => ({ id: 'a', action, actorName: 'Minh', deviceShort: null, details, createdAt: '' });
    expect(activityLine(item('income_added', { description: 'Thu 2 khách vãng lai', amount: 200000 }), undefined, t)).toBe('Minh added 200.000₫ to the fund · Thu 2 khách vãng lai');
    expect(activityLine(item('expense_added', { description: 'Nước sau trận', amount: 150000, paidFromFund: true }), undefined, t)).toBe('Minh paid 150.000₫ from the fund · Nước sau trận');
    expect(activityLine(item('income_disabled', {}), undefined, t)).toBe('Minh disabled fund income');
  });
});
