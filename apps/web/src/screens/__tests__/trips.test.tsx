import { describe, it, expect, afterEach, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { MyTrips } from '../MyTrips';
import { CreateTrip } from '../CreateTrip';
import { Landing } from '../Landing';

const me = (consentAt: string | null = '2026-10-12T00:00:00.000Z') => ({ user: { id: 'u-minh', email: 'minh@example.com', name: 'Minh', consentAt } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Landing', () => {
  it('offers Google sign-in that returns to my trips', async () => {
    mockApi({ 'GET /api/me': { user: null } });
    renderAt(<Landing />);
    const link = await screen.findByRole('link', { name: 'Sign in with Google' });
    expect(link).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Ftrips');
  });

  it('landing shows the headline and how it works', async () => {
    mockApi({ 'GET /api/me': { user: null } });
    renderAt(<Landing />);
    expect(await screen.findByRole('heading', { name: 'Split trip costs. Settle up with VietQR.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument();
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    const lines: [string, string][] = [
      ['Create a trip', "Add who's coming."],
      ['Share one link', 'Everyone adds what they paid.'],
      ['Settle up with VietQR', 'Pay each other with a VietQR code.'],
    ];
    lines.forEach(([title, body], i) => {
      expect(within(steps[i]!).getByText(title)).toBeInTheDocument();
      expect(within(steps[i]!).getByText(body)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('button', { name: 'Switch to Tiếng Việt' })).toBeInTheDocument();
  });
});

describe('MyTrips', () => {
  it('shows the empty state with one way forward', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/trips': [] });
    renderAt(<MyTrips />);
    expect(await screen.findByText('Plan your first trip')).toBeInTheDocument();
    expect(screen.getByText('Create a trip, then share one link with your group.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New trip' })).toHaveAttribute('href', '/trips/new');
  });

  it('is called Your trips and keeps the account menu in the header', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/trips': [] });
    renderAt(<MyTrips />);
    expect(await screen.findByRole('heading', { name: 'Your trips' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Account' })).toBeInTheDocument();
  });

  it('colours each trip line by what I owe and marks archived trips', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt', archived: false, myBalance: 892500 },
        { id: 't-2', name: 'Phú Quốc', archived: false, myBalance: -120000 },
        { id: 't-3', name: 'Hội An', archived: true, myBalance: 0 },
      ],
    });
    renderAt(<MyTrips />);
    const owed = within(await screen.findByRole('link', { name: /Đà Lạt/ }));
    expect(owed.getByText("You're owed")).toHaveClass('fsl-my-trips__line--success');
    expect(owed.getByText('892.500₫')).toBeInTheDocument();
    const owe = within(screen.getByRole('link', { name: /Phú Quốc/ }));
    expect(owe.getByText('You owe')).toHaveClass('fsl-my-trips__line--danger');
    expect(owe.getByText('120.000₫')).toBeInTheDocument();
    const settled = within(screen.getByRole('link', { name: /Hội An/ }));
    expect(settled.getByText('Settled')).toHaveClass('fsl-my-trips__line--neutral');
    expect(settled.getByText('· archived')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Đà Lạt/ })).queryByText('· archived')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New trip' })).toHaveAttribute('href', '/trips/new');
  });

  it('lists trips with my balance', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/trips': [{ id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 1630000 }] });
    renderAt(<MyTrips />);
    expect(await screen.findByText('Đà Lạt · Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('1.630.000₫')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Đà Lạt · Oct 2026/ })).toHaveAttribute('href', '/t/t-1');
  });

  it('asks for privacy consent first', async () => {
    const { calls } = mockApi({ 'GET /api/me': me(null), 'GET /api/trips': [], 'POST /api/me/consent': null });
    renderAt(<MyTrips />);
    const box = await screen.findByRole('checkbox', { name: 'I agree to the privacy notice' });
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go).toBeDisabled();
    await userEvent.click(box);
    await userEvent.click(go);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/me/consent')).toBe(true));
  });
});

describe('CreateTrip', () => {
  it('needs a trip name and at least one other person', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    const submit = await screen.findByRole('button', { name: 'Create trip' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Trip name'), 'Đà Lạt');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getAllByPlaceholderText('Name')[0]!, 'An');
    expect(submit).toBeEnabled();
  });

  it('prefills my name, posts the trip and opens it', async () => {
    const { calls } = mockApi({ 'GET /api/me': me(), 'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }) });
    renderAt(<CreateTrip />);
    expect(await screen.findByLabelText('Your name')).toHaveValue('Minh');
    await userEvent.type(screen.getByLabelText('Trip name'), 'Đà Lạt · Oct 2026');
    await userEvent.type(screen.getAllByPlaceholderText('Name')[0]!, 'An');
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await userEvent.type(screen.getAllByPlaceholderText('Name')[1]!, 'Bình');
    await userEvent.click(screen.getByRole('button', { name: 'Create trip' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/trips')?.body).toEqual({ name: 'Đà Lạt · Oct 2026', myName: 'Minh', people: [{ name: 'An' }, { name: 'Bình' }] });
  });
});

describe('CreateTrip people', () => {
  const chi = { userId: 'u-chi', name: 'Chi Trần', trips: ['Phú Quốc', 'Hội An'] };
  const chau = { userId: 'u-chau', name: 'Châu', trips: ['Hội An'] };
  const nameLines = () => screen.getAllByPlaceholderText('Name') as HTMLInputElement[];
  const posted = (calls: { method: string; path: string; body: unknown }[]) => calls.filter((c) => c.method === 'POST' && c.path === '/api/trips');

  it('Enter adds a line and never submits', async () => {
    const { calls } = mockApi({ 'GET /api/me': me(), 'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }) });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(screen.getByLabelText('Trip name'), 'Đà Lạt');
    await userEvent.type(nameLines()[0]!, 'An{Enter}');
    expect(nameLines()).toHaveLength(2);
    expect(nameLines()[1]!).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(nameLines()).toHaveLength(2);
    await userEvent.keyboard('Bình{Enter}');
    expect(nameLines().map((l) => l.value)).toEqual(['An', 'Bình', '']);
    expect(screen.getByLabelText('Trip name')).toHaveValue('Đà Lạt');
    expect(posted(calls)).toHaveLength(0);
  });

  it('handles Enter itself, so the browser never submits from a name line', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    // A jsdom form without an inline submit button does not submit on Enter, so check that the key's default is cancelled.
    expect(fireEvent.keyDown(nameLines()[0]!, { key: 'Enter' })).toBe(false);
    await userEvent.type(nameLines()[0]!, 'An');
    expect(fireEvent.keyDown(nameLines()[0]!, { key: 'Enter' })).toBe(false);
    expect(nameLines()).toHaveLength(2);
  });

  it('Enter on a line above an empty one moves to it instead of adding another', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(nameLines()[0]!, 'An{Enter}');
    await userEvent.click(nameLines()[0]!);
    await userEvent.keyboard('{Enter}');
    expect(nameLines()).toHaveLength(2);
    expect(nameLines()[1]!).toHaveFocus();
  });

  it('Backspace on an empty line removes it', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.click(nameLines()[0]!);
    await userEvent.keyboard('{Backspace}');
    expect(nameLines()).toHaveLength(1);
    await userEvent.type(nameLines()[0]!, 'An{Enter}');
    expect(nameLines()).toHaveLength(2);
    await userEvent.keyboard('{Backspace}');
    expect(nameLines().map((l) => l.value)).toEqual(['An']);
    expect(nameLines()[0]!).toHaveFocus();
    expect(nameLines()[0]!.selectionStart).toBe(2);
    await userEvent.keyboard('{Backspace}');
    expect(nameLines()[0]!).toHaveValue('A');
  });

  it('pasting a list fills one line per name', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.click(nameLines()[0]!);
    await userEvent.paste('An, Bình\nChi');
    expect(nameLines().map((l) => l.value)).toEqual(['An', 'Bình', 'Chi']);
    expect(nameLines()[2]!).toHaveFocus();
    await userEvent.paste(' Dũng ,, \r\n Em,');
    expect(nameLines().map((l) => l.value)).toEqual(['An', 'Bình', 'Chi', 'Dũng', 'Em']);
  });

  it('pasting one name works as it always did', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.click(nameLines()[0]!);
    await userEvent.paste('Thảo Vy');
    expect(nameLines().map((l) => l.value)).toEqual(['Thảo Vy']);
  });

  it('suggests people with an account and adds their account', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people': [chi],
      'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }),
    });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(screen.getByLabelText('Trip name'), 'Đà Lạt');
    await userEvent.type(nameLines()[0]!, 'An{Enter}');
    await userEvent.type(nameLines()[1]!, 'ch');
    const list = await screen.findByRole('listbox', { name: 'From your recent trips' });
    const option = within(list).getByRole('option', { name: /Chi Trần/ });
    expect(option).toHaveTextContent('Phú Quốc · Hội An');
    await userEvent.click(option);

    const row = screen.getByLabelText('Chi Trần · has an account');
    expect(within(row).getByText('Chi Trần')).toBeInTheDocument();
    expect(within(row).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(row).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(nameLines().map((l) => l.value)).toEqual(['An', '']);
    expect(nameLines()[1]!).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Create trip' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(posted(calls)[0]?.body).toEqual({ name: 'Đà Lạt', myName: 'Minh', people: [{ name: 'An' }, { name: 'Chi Trần', userId: 'u-chi' }] });
    expect(calls.filter((c) => c.path === '/api/me/people')).toHaveLength(1);
  });

  it('chooses a suggestion with the arrow keys and closes the list with Escape', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/me/people': [chi, chau] });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    const field = nameLines()[0]!;
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
    expect(screen.getByLabelText('Châu · has an account')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chi Trần · has an account')).not.toBeInTheDocument();
  });

  it('Enter without a chosen suggestion adds the typed name as it is', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/me/people': [chi] });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(nameLines()[0]!, 'ch');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/has an account/)).not.toBeInTheDocument();
    expect(nameLines().map((l) => l.value)).toEqual(['ch', '']);
  });

  it('an account cannot be picked twice', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/me/people': [chi] });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(nameLines()[0]!, 'ch');
    await userEvent.click(await screen.findByRole('option', { name: /Chi Trần/ }));
    expect(screen.getByLabelText('Chi Trần · has an account')).toBeInTheDocument();

    await userEvent.type(nameLines()[0]!, 'ch');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Chi Trần' }));
    expect(screen.queryByLabelText('Chi Trần · has an account')).not.toBeInTheDocument();
    await userEvent.clear(nameLines()[0]!);
    await userEvent.type(nameLines()[0]!, 'ch');
    expect(await screen.findByRole('option', { name: /Chi Trần/ })).toBeInTheDocument();
  });

  it('warns when a typed name matches a picked account, and the trip can still be created', async () => {
    const hint = 'Chi Trần is already on the list with their account.';
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people': [chi],
      'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }),
    });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(screen.getByLabelText('Trip name'), 'Đà Lạt');
    await userEvent.type(nameLines()[0]!, 'ch');
    await userEvent.click(await screen.findByRole('option', { name: /Chi Trần/ }));

    await userEvent.type(nameLines()[0]!, 'chi tra');
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    await userEvent.type(nameLines()[0]!, 'n');
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(nameLines()[0]!).toHaveAccessibleDescription(hint);

    await userEvent.type(nameLines()[0]!, 'h');
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(nameLines()[0]!).not.toHaveAccessibleDescription();
    await userEvent.keyboard('{Backspace}');
    expect(screen.getByText(hint)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create trip' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(posted(calls)[0]?.body).toEqual({ name: 'Đà Lạt', myName: 'Minh', people: [{ name: 'Chi Trần', userId: 'u-chi' }, { name: 'chi tran' }] });
  });

  it('the warning goes away when the account row is removed', async () => {
    const hint = 'Chi Trần is already on the list with their account.';
    mockApi({ 'GET /api/me': me(), 'GET /api/me/people': [chi] });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(nameLines()[0]!, 'ch');
    await userEvent.click(await screen.findByRole('option', { name: /Chi Trần/ }));
    await userEvent.type(nameLines()[0]!, 'CHÍ TRẦN');
    expect(screen.getByText(hint)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Chi Trần' }));
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(nameLines()[0]!).toHaveValue('CHÍ TRẦN');
    expect(nameLines()[0]!).not.toHaveAccessibleDescription();
  });

  it('removing the account row leaves a line to type in', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/me/people': [chi] });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(nameLines()[0]!, 'ch');
    await userEvent.click(await screen.findByRole('option', { name: /Chi Trần/ }));
    expect(nameLines()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Chi Trần' }));
    expect(nameLines().map((l) => l.value)).toEqual(['']);
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('works without suggestions when the list fails to load', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people': () => Response.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, { status: 500 }),
      'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }),
    });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await waitFor(() => expect(calls.some((c) => c.path === '/api/me/people')).toBe(true));
    await userEvent.type(screen.getByLabelText('Trip name'), 'Đà Lạt');
    await userEvent.type(nameLines()[0]!, 'ch');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create trip' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(posted(calls)[0]?.body).toEqual({ name: 'Đà Lạt', myName: 'Minh', people: [{ name: 'ch' }] });
    expect(calls.filter((c) => c.path === '/api/me/people')).toHaveLength(1);
  });

  it('shows why the trip could not be created next to the button', async () => {
    mockApi({
      'GET /api/me': me(),
      'POST /api/trips': () => Response.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, { status: 500 }),
    });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Your name');
    await userEvent.type(screen.getByLabelText('Trip name'), 'Đà Lạt');
    await userEvent.type(nameLines()[0]!, 'An');
    await userEvent.click(screen.getByRole('button', { name: 'Create trip' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled();
  });
});
