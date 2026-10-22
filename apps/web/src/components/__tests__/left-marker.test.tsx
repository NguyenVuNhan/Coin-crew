import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { ActivityAction, ActivityItem, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { t } from '../../i18n';
import { activityLine } from '../../lib/activityText';
import { YourTransfers } from '../YourTransfers';
import { ExpenseDetails } from '../ExpenseDetails';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Chi left the group but still owes Minh and is on the homestay expense (e-1). */
function chiLeft(): TripView {
  const base = tripView();
  return { ...base, people: base.people.map((p) => (p.id === PIDS.C ? { ...p, status: 'left', isMember: false } : p)) };
}

describe('people who left', () => {
  it('activity says who left, joined, rejoined and was brought back', () => {
    const item = (action: ActivityAction, details: Record<string, unknown> = {}): ActivityItem => ({
      id: 'a', action, actorName: 'Chi', deviceShort: null, details, createdAt: '2026-10-22T08:00:00.000Z',
    });
    expect(activityLine(item('person_left'), undefined, t)).toBe('Chi left the group');
    expect(activityLine(item('member_joined'), undefined, t)).toBe('Chi joined');
    expect(activityLine(item('member_rejoined'), undefined, t)).toBe('Chi rejoined');
    expect(activityLine(item('person_restored', { name: 'An' }), undefined, t)).toBe('Chi brought back An');
  });

  it('a transfer with someone who left marks them Left', () => {
    mockApi({});
    renderAt(<YourTransfers view={chiLeft()} />);
    expect(within(screen.getByTestId(`transfer-${PIDS.C}-${PIDS.M}`)).getByText('Left')).toBeInTheDocument();
    expect(within(screen.getByTestId(`transfer-${PIDS.B}-${PIDS.M}`)).queryByText('Left')).toBeNull();
  });

  it('expense details mark a left person Left', () => {
    mockApi({});
    renderAt(<ExpenseDetails view={chiLeft()} expenseId="e-1" onClose={() => {}} />);
    const shares = screen.getByRole('list', { name: 'Split' });
    const chiLine = within(shares).getByText('Chi').closest('li')!;
    expect(within(chiLine).getByText('Left')).toBeInTheDocument();
    expect(within(shares).getAllByText('Left')).toHaveLength(1);
  });
});
