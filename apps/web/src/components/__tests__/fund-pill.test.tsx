import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import { tripView, viewerView } from '../../test/fixtures';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { FundPill } from '../FundPill';
import { MemberTrip } from '../../screens/MemberTrip';
import { ViewOnlyTrip } from '../../screens/ViewOnlyTrip';

const pill = (name = 'Group fund, 400.000₫') => screen.getByRole('button', { name });

describe('FundPill', () => {
  it('no pill in a trip group, or before any fund history', () => {
    renderAt(<FundPill view={tripView()} />);
    expect(screen.queryByRole('button', { name: /Group fund/ })).toBeNull();
    const base = sportFundView();
    renderAt(<FundPill view={{ ...base, fund: { balance: 0, added: 0, spent: 0, incomes: [] }, expenses: [] }} />);
    expect(screen.queryByRole('button', { name: /Group fund/ })).toBeNull();
  });

  it('admin: balance on the pill; sheet with Added, Spent, admins and Add to fund', async () => {
    renderAt(<FundPill view={sportFundView()} />);
    await userEvent.click(pill());
    const sheet = screen.getByRole('dialog', { name: 'Group fund' });
    expect(within(sheet).getByText('+650.000₫')).toBeInTheDocument();
    expect(within(sheet).getByText('-250.000₫')).toBeInTheDocument();
    expect(within(sheet).getByText('Minh')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Add to fund' })).toHaveAttribute('href', '/t/t-1/expenses/new?type=income');
  });

  it('others: the same sheet without the link', async () => {
    renderAt(<FundPill view={sportMemberView()} />);
    await userEvent.click(pill());
    const sheet = screen.getByRole('dialog', { name: 'Group fund' });
    expect(within(sheet).getByText('+650.000₫')).toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'Add to fund' })).toBeNull();
    expect(within(sheet).getByText('Only admins add or spend fund money.')).toBeInTheDocument();
  });

  it('empty fund: the empty message instead of Added and Spent', async () => {
    const view = sportFundView({ fund: { balance: 0, added: 200000, spent: 200000, incomes: sportFundView().fund!.incomes } });
    renderAt(<FundPill view={view} />);
    await userEvent.click(pill('Group fund, 0₫'));
    const sheet = screen.getByRole('dialog', { name: 'Group fund' });
    expect(within(sheet).getByText('The fund is empty right now.')).toBeInTheDocument();
    expect(within(sheet).queryByText('Added')).toBeNull();
    expect(within(sheet).queryByText('Spent')).toBeNull();
  });

  it('sits under the balance on the member page and leads the view-only page', () => {
    const view = sportFundView();
    const { unmount } = renderAt(<MemberTrip view={view} />);
    const balance = document.querySelector('.fsl-balance')!;
    expect(balance.compareDocumentPosition(pill()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    renderAt(<ViewOnlyTrip view={{ ...view, me: viewerView().me }} />);
    expect(pill()).toBeInTheDocument();
  });
});
