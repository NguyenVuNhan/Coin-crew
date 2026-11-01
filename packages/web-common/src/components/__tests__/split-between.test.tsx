import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonView } from '@fsl/core';
import { setLang } from '../../i18n';
import { SplitBetween } from '../SplitBetween';

const person = (id: string, name: string): PersonView => ({ id, name, status: 'active', isMember: false, bank: 'none' });
const people = [person('p-minh', 'Minh'), person('p-an', 'An'), person('p-binh', 'Bình'), person('p-chi', 'Chi')];

beforeEach(() => setLang('en'));

describe('SplitBetween', () => {
  it('shows how many and who', () => {
    render(<SplitBetween people={people} chosen={new Set(['p-minh', 'p-an', 'p-chi'])} me="p-minh" onOpen={() => {}} />);
    expect(screen.getByText('Split between · 3 of 4')).toBeInTheDocument();
    expect(screen.getByText('You, An, Chi')).toBeInTheDocument();
  });

  it('says Everyone when all are in', () => {
    render(<SplitBetween people={people} chosen={new Set(people.map((p) => p.id))} me="p-minh" onOpen={() => {}} />);
    expect(screen.getByText('Split between · Everyone (4)')).toBeInTheDocument();
  });

  it('says no one yet and asks to choose', () => {
    render(<SplitBetween people={people} chosen={new Set()} me="p-minh" onOpen={() => {}} />);
    expect(screen.getByText('No one yet')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one person.')).toBeInTheDocument();
  });

  it('ignores chosen ids that are not offered', () => {
    render(<SplitBetween people={people} chosen={new Set(['p-minh', 'p-gone'])} me="p-minh" onOpen={() => {}} />);
    expect(screen.getByText('Split between · 1 of 4')).toBeInTheDocument();
  });

  it('is one button that opens the sheet', async () => {
    const onOpen = vi.fn();
    render(<SplitBetween people={people} chosen={new Set(['p-minh', 'p-an', 'p-chi'])} me="p-minh" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Split between · 3 of 4. You, An, Chi. Change' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('its accessible name keeps the visible count (label in name)', () => {
    render(<SplitBetween people={people} chosen={new Set(people.map((p) => p.id))} me="p-minh" onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Split between · Everyone (4). You, An, Bình, Chi. Change' })).toBeInTheDocument();
  });
});
