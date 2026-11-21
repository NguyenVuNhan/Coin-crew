import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonView } from '@cc/core';
import { renderAt } from '../../../test/render';
import { SplitFold } from '../SplitFold';
import type { QuickSplit } from '../useQuickSplit';

const PEOPLE: PersonView[] = [
  { id: 'me', name: 'Bạn', avatarUrl: null, status: 'active', isMember: true, bank: 'none' },
  { id: 'minh', name: 'Minh', avatarUrl: null, status: 'active', isMember: true, bank: 'none' },
  { id: 'lan', name: 'Lan', avatarUrl: null, status: 'active', isMember: true, bank: 'none' },
];

const NAMES = new Map<string, string>([
  ['me', 'Bạn'],
  ['minh', 'Minh'],
  ['lan', 'Lan'],
]);

function makeFakeSplit(overrides: Partial<QuickSplit> = {}): QuickSplit {
  return {
    people: PEOPLE,
    chipIds: ['minh', 'lan'],
    chosen: new Set(['minh', 'lan']),
    toggle: vi.fn(),
    setChosen: vi.fn(),
    flipped: false,
    setFlipped: vi.fn(),
    payerId: 'me',
    setPayerId: vi.fn(),
    mode: 'equal',
    setMode: vi.fn(),
    inputs: {},
    setInput: vi.fn(),
    splitParticipants: ['me', 'minh', 'lan'],
    result: {
      ok: true,
      shares: [
        { participantId: 'me', amount: 40000 },
        { participantId: 'minh', amount: 40000 },
        { participantId: 'lan', amount: 40000 },
      ],
    },
    outcome: null,
    canFlip: true,
    splitExtra: undefined,
    isDirty: true,
    reset: vi.fn(),
    ...overrides,
  };
}

describe('SplitFold', () => {
  it('shows folded summary text for 120k equal over 3 people', () => {
    const split = makeFakeSplit();
    renderAt(<SplitFold split={split} amount={120000} names={NAMES} />);

    const fold = screen.getByTestId('entry-split-fold');
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(fold).toHaveTextContent('Split');
    expect(fold).toHaveTextContent('Equally · 3 people');
  });

  it('opening shows all five split modes', async () => {
    const split = makeFakeSplit();
    renderAt(<SplitFold split={split} amount={120000} names={NAMES} />);

    await userEvent.click(screen.getByTestId('entry-split-fold'));

    expect(screen.getByTestId('entry-split-fold')).toHaveAttribute('aria-expanded', 'true');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(screen.getByRole('radio', { name: 'Equally' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Exact amounts' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Percent' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Shares' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Adjust' })).toBeInTheDocument();
  });

  it('typing 20/50/50 in amounts mode calls setInput each time', async () => {
    const setInput = vi.fn();
    const split = makeFakeSplit({
      mode: 'amounts',
      setInput,
      result: null,
    });
    renderAt(<SplitFold split={split} amount={120000} names={NAMES} />);

    await userEvent.click(screen.getByTestId('entry-split-fold'));

    await userEvent.type(screen.getByTestId('entry-split-input-me'), '20');
    await userEvent.type(screen.getByTestId('entry-split-input-minh'), '50');
    await userEvent.type(screen.getByTestId('entry-split-input-lan'), '50');

    expect(setInput).toHaveBeenCalledWith('me', '2');
    expect(setInput).toHaveBeenCalledWith('me', '0');
    expect(setInput).toHaveBeenCalledWith('minh', '5');
    expect(setInput).toHaveBeenCalledWith('minh', '0');
    expect(setInput).toHaveBeenCalledWith('lan', '5');
    expect(setInput).toHaveBeenCalledWith('lan', '0');
  });

  it('shows an alert when the split does not add up', async () => {
    const split = makeFakeSplit({
      mode: 'amounts',
      inputs: { me: '20000', minh: '50000', lan: '40000' },
      result: { ok: false, error: 'AMOUNTS_DONT_ADD_UP' },
    });
    renderAt(<SplitFold split={split} amount={120000} names={NAMES} />);

    await userEvent.click(screen.getByTestId('entry-split-fold'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("The amounts don't add up to the total.");
  });

  it('renders nothing when there is only a single participant', () => {
    const split = makeFakeSplit({
      chosen: new Set(['minh']),
      splitParticipants: ['minh'],
    });
    renderAt(<SplitFold split={split} amount={50000} names={NAMES} />);

    expect(screen.queryByTestId('entry-split-fold')).toBeNull();
  });
});
