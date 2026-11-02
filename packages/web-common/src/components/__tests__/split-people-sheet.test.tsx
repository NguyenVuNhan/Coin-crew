import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function Harness({ people, start, recent = [], onClose = () => {}, open = true }: {
  people: PersonView[]; start: string[]; recent?: RecentGroup[]; onClose?: () => void; open?: boolean;
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(start.map((name) => idOf(people, name))));
  return <SplitPeopleSheet open={open} onClose={onClose} people={people} chosen={chosen} onChange={setChosen} me={idOf(people, 'Minh')} recent={recent} />;
}

const everyone = (people: PersonView[]) => people.map((p) => p.name);
const addPeople = () => screen.getByRole('textbox', { name: 'Add people' });
const chipNames = () => [...document.querySelectorAll('.fsl-split-sheet__chip-name')].map((c) => c.textContent);

beforeEach(() => setLang('en'));

describe('SplitPeopleSheet, any group size', () => {
  it('a small group gets the search field too, with no tick boxes', () => {
    render(<Harness people={small} start={everyone(small)} />);
    expect(addPeople()).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('removing a chip takes the person out', async () => {
    render(<Harness people={small} start={everyone(small)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove An' }));
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
});

describe('SplitPeopleSheet, searching', () => {
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

  it('tapping a suggestion or a chip never takes focus from the search box (the phone keyboard stays up)', async () => {
    render(<Harness people={big} start={['Minh', 'Vy']} />);
    const onBlur = vi.fn();
    addPeople().addEventListener('blur', onBlur);
    await userEvent.type(addPeople(), 'lo');
    await userEvent.click(screen.getByRole('button', { name: 'Add Long' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Vy' }));
    expect(onBlur).not.toHaveBeenCalled();
    expect(addPeople()).toHaveFocus();
  });

  it('chips are in the order people were added, and Backspace removes the latest', async () => {
    render(<Harness people={big} start={['Minh']} />);
    await userEvent.type(addPeople(), 'vy{Enter}');
    await userEvent.type(addPeople(), 'an{Enter}');
    expect(chipNames()).toEqual(['You', 'Vy', 'An']);
    await userEvent.keyboard('{Backspace}');
    expect(chipNames()).toEqual(['You', 'Vy']);
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

  it('a name that is already chosen says so, instead of "no one called"', async () => {
    render(<Harness people={big} start={['Minh', 'An']} />);
    await userEvent.type(addPeople(), 'an');
    expect(screen.getByText('Already in: An')).toBeInTheDocument();
    expect(screen.queryByText(/No one called/)).toBeNull();
  });

  it('no match, and everyone chosen', async () => {
    const { unmount } = render(<Harness people={big} start={['Minh']} />);
    await userEvent.type(addPeople(), 'xyz');
    expect(screen.getByText('No one called "xyz" in this group.')).toBeInTheDocument();
    unmount();
    render(<Harness people={big} start={everyone(big)} />);
    expect(screen.getByText('Everyone in the group is already chosen.')).toBeInTheDocument();
  });

  it('closing the sheet clears the search', async () => {
    const { rerender } = render(<Harness people={big} start={['Minh']} />);
    await userEvent.type(addPeople(), 'lo');
    rerender(<Harness people={big} start={['Minh']} open={false} />);
    rerender(<Harness people={big} start={['Minh']} open />);
    expect(addPeople()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Add An' })).toBeInTheDocument();
  });

  it('the viewer chip reads You', () => {
    render(<Harness people={big} start={['Minh']} />);
    expect(screen.getByRole('button', { name: 'Remove Minh' }).closest('.fsl-split-sheet__chip')).toHaveTextContent('You');
  });
});

describe('SplitPeopleSheet, keeping the search box in view', () => {
  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
  afterEach(() => {
    if (scrollTop) Object.defineProperty(Element.prototype, 'scrollTop', scrollTop);
    if (scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', scrollHeight);
  });

  it('the chip area scrolls to its end on open and after each change, where the text box is', async () => {
    const scrolledTo: number[] = [];
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 480 });
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set(this: Element, v: number) { if (this.classList.contains('fsl-split-sheet__field')) scrolledTo.push(v); },
    });
    render(<Harness people={big} start={everyone(big)} />);
    expect(scrolledTo).toContain(480);
    scrolledTo.length = 0;
    await userEvent.click(screen.getByRole('button', { name: 'Remove Vy' }));
    expect(scrolledTo).toContain(480);
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
