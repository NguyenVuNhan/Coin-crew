import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonView } from '@fsl/core';
import { setLang } from '../../i18n';
import type { RecentGroup } from '../../lib/recentGroups';
import { SplitPeopleSheet } from '../SplitPeopleSheet';

const person = (name: string): PersonView => ({
  id: `p-${name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, '-').toLowerCase()}`,
  name, status: 'active', isMember: false, bank: 'none',
});
const small = ['Minh', 'An', 'Bình', 'Chi', 'Dũng'].map(person);
const big = [...small, ...['Long', 'Loan', 'Hà Lộc', 'Đức', 'Thảo', 'Khoa', 'Vy', 'Phúc', 'Quân'].map(person)];
const idOf = (people: PersonView[], name: string) => people.find((p) => p.name === name)!.id;

function Harness({ people, start, recent = [], onClose = () => {} }: {
  people: PersonView[]; start: string[]; recent?: RecentGroup[]; onClose?: () => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(start.map((name) => idOf(people, name))));
  return <SplitPeopleSheet open onClose={onClose} people={people} chosen={chosen} onChange={setChosen} me={idOf(people, 'Minh')} recent={recent} />;
}

const everyone = (people: PersonView[]) => people.map((p) => p.name);
const addPeople = () => screen.getByRole('textbox', { name: 'Add people' });

beforeEach(() => setLang('en'));

describe('SplitPeopleSheet, a small group', () => {
  it('ticks show who is in, and unticking takes them out', async () => {
    render(<Harness people={small} start={everyone(small)} />);
    const an = screen.getByRole('checkbox', { name: 'An' });
    expect(an).toBeChecked();
    await userEvent.click(an);
    expect(screen.getByText('4 of 5')).toBeInTheDocument();
  });

  it('Clear all, then Add everyone', async () => {
    render(<Harness people={small} start={everyone(small)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('0 of 5')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one person.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add everyone' }));
    expect(screen.getByText('5 of 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add everyone' })).toBeNull();
  });

  it('12 people still get the tick list', () => {
    const twelve = big.slice(0, 12);
    render(<Harness people={twelve} start={everyone(twelve)} />);
    expect(screen.queryByRole('textbox', { name: 'Add people' })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(12);
  });
});

describe('SplitPeopleSheet, a big group', () => {
  it('13 people get the search field', () => {
    const thirteen = big.slice(0, 13);
    render(<Harness people={thirteen} start={['Minh']} />);
    expect(addPeople()).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('typing suggests only people not chosen, by word start', async () => {
    render(<Harness people={big} start={['Minh']} />);
    await userEvent.type(addPeople(), 'lo');
    for (const name of ['Long', 'Loan', 'Hà Lộc']) expect(screen.getByRole('button', { name: `Add ${name}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Minh' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('3 matches');
  });

  it('a suggestion becomes a chip, clears the text and keeps focus', async () => {
    render(<Harness people={big} start={['Minh']} />);
    await userEvent.type(addPeople(), 'lo');
    await userEvent.click(screen.getByRole('button', { name: 'Add Long' }));
    expect(screen.getByRole('button', { name: 'Remove Long' })).toBeInTheDocument();
    expect(addPeople()).toHaveValue('');
    expect(addPeople()).toHaveFocus();
  });

  it('× removes the chip and the person is suggested again', async () => {
    render(<Harness people={big} start={['Minh', 'Long']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Long' }));
    expect(screen.queryByRole('button', { name: 'Remove Long' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Long' })).toBeInTheDocument();
  });

  it('Enter adds the first suggestion', async () => {
    render(<Harness people={big} start={['Minh']} />);
    await userEvent.type(addPeople(), 'duc{Enter}');
    expect(screen.getByRole('button', { name: 'Remove Đức' })).toBeInTheDocument();
  });

  it('Enter in an empty field adds no one (the phone keyboard return key)', async () => {
    render(<Harness people={big} start={['Minh']} />);
    await userEvent.click(addPeople());
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('1 of 14')).toBeInTheDocument();
  });

  it('Enter while a word is still being composed adds no one', () => {
    render(<Harness people={big} start={['Minh']} />);
    fireEvent.change(addPeople(), { target: { value: 'duc' } });
    fireEvent.keyDown(addPeople(), { key: 'Enter', isComposing: true });
    expect(screen.queryByRole('button', { name: 'Remove Đức' })).toBeNull();
  });

  it('Backspace in an empty field removes the last chip, and does nothing with no chips', async () => {
    render(<Harness people={big} start={['Minh', 'Long']} />);
    await userEvent.click(addPeople());
    await userEvent.keyboard('{Backspace}');
    expect(screen.queryByRole('button', { name: 'Remove Long' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Minh' })).toBeInTheDocument();
    await userEvent.keyboard('{Backspace}{Backspace}');
    expect(screen.getByText('0 of 14')).toBeInTheDocument();
  });

  it('no match, and everyone chosen', async () => {
    const { unmount } = render(<Harness people={big} start={['Minh']} />);
    await userEvent.type(addPeople(), 'xyz');
    expect(screen.getByText('No one called "xyz" in this group.')).toBeInTheDocument();
    unmount();
    render(<Harness people={big} start={everyone(big)} />);
    expect(screen.getByText('Everyone in the group is already chosen.')).toBeInTheDocument();
  });

  it('the viewer chip reads You', () => {
    render(<Harness people={big} start={['Minh']} />);
    expect(screen.getByRole('button', { name: 'Remove Minh' }).closest('.fsl-split-sheet__chip')).toHaveTextContent('You');
  });
});

describe('SplitPeopleSheet, recent groups and Done', () => {
  const cafe: RecentGroup = { expenseId: 'e-4', description: 'Cà phê Túi Mơ To', spentOn: '2026-10-10', people: ['p-minh', 'p-an', 'p-chi'] };

  it('Use replaces the selection', async () => {
    render(<Harness people={small} start={everyone(small)} recent={[cafe]} />);
    expect(screen.getByText('Same people as')).toBeInTheDocument();
    expect(screen.getByText('Cà phê Túi Mơ To')).toBeInTheDocument();
    expect(screen.getByText(/3 people/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use the people from Cà phê Túi Mơ To' }));
    expect(screen.getByText('3 of 5')).toBeInTheDocument();
  });

  it('no recent groups hides the section', () => {
    render(<Harness people={small} start={everyone(small)} />);
    expect(screen.queryByText('Same people as')).toBeNull();
  });

  it('Done closes', async () => {
    const onClose = vi.fn();
    render(<Harness people={small} start={everyone(small)} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
