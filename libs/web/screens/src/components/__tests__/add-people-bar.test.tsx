import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { AddPeopleBar, type NewPerson } from '../AddPeopleBar';

const chi = { userId: 'u-chi', name: 'Chi Trần', trips: ['Phú Quốc', 'Hội An'] };
const chau = { userId: 'u-chau', name: 'Châu', trips: ['Hội An'] };

beforeEach(() => {
  mockApi({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AddPeopleBar', () => {
  it('trip group: + Add adds the name, clears the field and keeps focus', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    expect(field).toHaveAttribute('placeholder', 'Name');
    expect(field).not.toBeDisabled();

    await userEvent.type(field, 'An');
    const addBtn = screen.getByRole('button', { name: '+ Add' });
    expect(fireEvent.mouseDown(addBtn)).toBe(false);
    await userEvent.click(addBtn);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ name: 'An', gender: null }]);
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
  });

  it('sport group: + Female adds with Female, then Enter reuses it', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={true} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'Lan');
    await userEvent.click(screen.getByRole('button', { name: '+ Female' }));

    expect(onAdd).toHaveBeenNthCalledWith(1, [{ name: 'Lan', gender: 'F' }]);
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();

    await userEvent.type(field, 'Hoa{Enter}');
    expect(onAdd).toHaveBeenNthCalledWith(2, [{ name: 'Hoa', gender: 'F' }]);
    expect(field).toHaveValue('');
  });

  it('sport group: Enter before any button adds as Male', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={true} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'An{Enter}');

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ name: 'An', gender: 'M' }]);
    expect(field).toHaveValue('');
  });

  it('ignores the Enter that ends an IME composition', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'An');

    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    expect(onAdd).not.toHaveBeenCalled();
    expect(field).toHaveValue('An');

    fireEvent.keyDown(field, { key: 'Enter', keyCode: 13, isComposing: true });
    expect(onAdd).not.toHaveBeenCalled();
    expect(field).toHaveValue('An');
  });

  it('shows coaching hint and restores name when a typed name is duplicate', async () => {
    const onAdd = vi.fn(async (people: NewPerson[]): Promise<NewPerson[]> => {
      return people;
    });
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);
    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'An{Enter}');

    expect(onAdd).toHaveBeenCalledWith([{ name: 'An', gender: null }]);
    expect(await screen.findByText('Already in the group. Add a last name or nickname to tell them apart.')).toBeInTheDocument();
    expect(field).toHaveValue('An');
  });

  it('pasting names with duplicates passes all names to onAdd for deduplication', async () => {
    const onAdd = vi.fn(async (people: NewPerson[]): Promise<NewPerson[]> => {
      const seen = new Set<string>();
      const skipped: NewPerson[] = [];
      for (const p of people) {
        if (seen.has(p.name.toLowerCase())) skipped.push(p);
        else seen.add(p.name.toLowerCase());
      }
      return skipped;
    });
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);
    const field = screen.getByLabelText('Name to add');
    await userEvent.click(field);
    await userEvent.paste('An, Bình, An, Chi');

    expect(onAdd).toHaveBeenCalledWith([
      { name: 'An', gender: null },
      { name: 'Bình', gender: null },
      { name: 'An', gender: null },
      { name: 'Chi', gender: null },
    ]);
  });

  it('Enter is always cancelled, so no form submits', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(false);
    expect(onAdd).not.toHaveBeenCalled();

    await userEvent.type(field, 'An');
    expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(false);
    expect(onAdd).toHaveBeenCalledWith([{ name: 'An', gender: null }]);
  });

  it('buttons are disabled for an empty or blank name', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    const { unmount } = renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);

    const tripField = screen.getByLabelText('Name to add');
    const addBtn = screen.getByRole('button', { name: '+ Add' });
    expect(addBtn).toBeDisabled();

    await userEvent.type(tripField, '   ');
    expect(addBtn).toBeDisabled();

    await userEvent.type(tripField, 'An');
    expect(addBtn).toBeEnabled();
    unmount();

    renderAt(<AddPeopleBar sport={true} onAdd={onAdd} />);
    const sportField = screen.getByLabelText('Name to add');
    const maleBtn = screen.getByRole('button', { name: '+ Male' });
    const femaleBtn = screen.getByRole('button', { name: '+ Female' });
    expect(maleBtn).toBeDisabled();
    expect(femaleBtn).toBeDisabled();

    await userEvent.type(sportField, '   ');
    expect(maleBtn).toBeDisabled();
    expect(femaleBtn).toBeDisabled();

    await userEvent.type(sportField, 'Bình');
    expect(maleBtn).toBeEnabled();
    expect(femaleBtn).toBeEnabled();
  });

  it('pasting a list adds every name in one call', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={true} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'Draft');
    await userEvent.paste('An, Bình\nChi');

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([
      { name: 'An', gender: null },
      { name: 'Bình', gender: null },
      { name: 'Chi', gender: null },
    ]);
    expect(field).toHaveValue('Draft');
  });

  it('pasting one name just fills the field', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.click(field);
    await userEvent.paste('Thảo Vy');

    expect(onAdd).not.toHaveBeenCalled();
    expect(field).toHaveValue('Thảo Vy');
  });

  it('a name that could not be added comes back into an empty field', async () => {
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => [{ name: 'An', gender: null }]);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'An');
    await userEvent.click(screen.getByRole('button', { name: '+ Add' }));

    await waitFor(() => expect(field).toHaveValue('An'));
    expect(field).toHaveFocus();
  });

  it('suggests friends from other groups and adds their account', async () => {
    mockApi({ 'GET /api/me/people': [chi, chau] });
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} suggest={{ exclude: new Set() }} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'ch');

    const list = await screen.findByRole('listbox', { name: 'From your recent trips' });
    const option = within(list).getByRole('option', { name: /Chi Trần/ });
    expect(option).toHaveTextContent('Phú Quốc · Hội An');
    await userEvent.click(option);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ name: 'Chi Trần', userId: 'u-chi', gender: null }]);
    expect(field).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('arrow keys choose a suggestion and Escape closes the list', async () => {
    mockApi({ 'GET /api/me/people': [chi, chau] });
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} suggest={{ exclude: new Set() }} />);

    const field = screen.getByLabelText('Name to add');
    expect(field).toHaveAttribute('role', 'combobox');
    expect(field).toHaveAttribute('aria-expanded', 'false');

    await userEvent.type(field, 'ch');
    const list = await screen.findByRole('listbox', { name: 'From your recent trips' });
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(field).toHaveAttribute('aria-expanded', 'true');
    expect(field).toHaveAttribute('aria-controls', list.id);
    expect(options.every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true);

    await userEvent.keyboard('{ArrowDown}');
    expect(options[0]!).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute('aria-activedescendant', options[0]!.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(options[1]!).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute('aria-activedescendant', options[1]!.id);
    await userEvent.keyboard('{ArrowUp}');
    expect(options[0]!).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(field).toHaveAttribute('aria-expanded', 'false');
    expect(field).toHaveValue('ch');
    await userEvent.keyboard('a');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ name: 'Châu', userId: 'u-chau', gender: null }]);
    expect(field).toHaveValue('');
  });

  it('listed accounts are not suggested', async () => {
    mockApi({ 'GET /api/me/people': [chi, chau] });
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} suggest={{ exclude: new Set(['u-chi']) }} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'ch');

    const list = await screen.findByRole('listbox', { name: 'From your recent trips' });
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(within(list).getByRole('option', { name: /Châu/ })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: /Chi Trần/ })).not.toBeInTheDocument();
  });

  it('without suggest, no recent-people request', async () => {
    const { calls } = mockApi({});
    const onAdd = vi.fn(async (_people: NewPerson[]): Promise<NewPerson[]> => []);
    renderAt(<AddPeopleBar sport={false} onAdd={onAdd} />);

    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'ch');

    expect(calls.some((c) => c.path === '/api/me/people')).toBe(false);
  });
});
