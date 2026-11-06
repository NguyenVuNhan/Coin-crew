import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { MyTrips } from '../MyTrips';
import { CreateTrip } from '../CreateTrip';
import { Landing } from '../Landing';
import { UndoSnackbarHost } from '../../components/UndoSnackbarHost';

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
    expect(await screen.findByText('Create your first group')).toBeInTheDocument();
    expect(screen.getByText('Create a trip or sport group, then share one link with everyone.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New group' })).toHaveAttribute('href', '/trips/new');
  });

  it('is called Your groups and keeps the account menu in the header', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/trips': [] });
    renderAt(<MyTrips />);
    expect(await screen.findByRole('heading', { name: 'Your groups' })).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'New group' })).toHaveAttribute('href', '/trips/new');
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
  it('the back arrow returns to the groups list', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    expect(await screen.findByRole('link', { name: 'Back' })).toHaveAttribute('href', '/groups');
  });

  it('needs a trip name and allows creating with empty members', async () => {
    const { calls } = mockApi({ 'GET /api/me': me(), 'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }) });
    renderAt(<CreateTrip />);
    const submit = await screen.findByRole('button', { name: 'Create group' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Group name'), 'Đà Lạt');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/trips')?.body).toEqual({
      name: 'Đà Lạt',
      myName: 'Minh',
      people: [],
      defaultLang: 'en',
    });
  });

  it('posts the trip and opens it without asking for your name', async () => {
    const { calls } = mockApi({ 'GET /api/me': me(), 'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }) });
    renderAt(<CreateTrip />);
    expect(await screen.findByLabelText('Group name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Group name'), 'Đà Lạt · Oct 2026');
    await userEvent.type(screen.getByLabelText('Name to add'), 'An{Enter}');
    await userEvent.type(screen.getByLabelText('Name to add'), 'Bình{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/trips')?.body).toEqual({ name: 'Đà Lạt · Oct 2026', myName: 'Minh', people: [{ name: 'An' }, { name: 'Bình' }], defaultLang: 'en' });
  });
});

describe('CreateTrip people', () => {
  const chi = { userId: 'u-chi', name: 'Chi Trần', trips: ['Phú Quốc', 'Hội An'] };
  const nameField = () => screen.getByLabelText('Name to add') as HTMLInputElement;
  const roster = () => screen.getByRole('list', { name: 'Who else is coming? (optional)' });
  const rowNames = () =>
    within(roster())
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.fsl-people-input__name')?.textContent);
  const posted = (calls: { method: string; path: string; body: unknown }[]) => calls.filter((c) => c.method === 'POST' && c.path === '/api/trips');

  it('Enter adds a row, keeps the field ready and never submits', async () => {
    const { calls } = mockApi({ 'GET /api/me': me(), 'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }) });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.type(screen.getByLabelText('Group name'), 'Đà Lạt');
    await userEvent.type(nameField(), 'An{Enter}');
    expect(rowNames()).toEqual(['Minh', 'An']);
    expect(nameField()).toHaveValue('');
    expect(nameField()).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(rowNames()).toEqual(['Minh', 'An']);
    await userEvent.keyboard('Bình{Enter}');
    expect(rowNames()).toEqual(['Minh', 'An', 'Bình']);
    expect(screen.getByLabelText('Group name')).toHaveValue('Đà Lạt');
    expect(posted(calls)).toHaveLength(0);
  });

  it('your own row is first and has no remove button', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    await waitFor(() => expect(rowNames()).toEqual(['Minh']));
    const own = within(roster()).getAllByRole('listitem')[0]!;
    expect(within(own).getByText('You')).toBeInTheDocument();
    expect(within(own).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('pasting a list adds one row per name', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.click(nameField());
    await userEvent.paste('An, Bình\nChi');
    expect(rowNames()).toEqual(['Minh', 'An', 'Bình', 'Chi']);
    await userEvent.paste(' Dũng ,, \r\n Em,');
    expect(rowNames()).toEqual(['Minh', 'An', 'Bình', 'Chi', 'Dũng', 'Em']);
    expect(nameField()).toHaveValue('');
  });

  it('a row can be removed', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.type(nameField(), 'An{Enter}');
    await userEvent.type(nameField(), 'Bình{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Remove An' }));
    expect(rowNames()).toEqual(['Minh', 'Bình']);
  });

  it('Undo removes the rows just added', async () => {
    mockApi({ 'GET /api/me': me() });
    renderAt(
      <>
        <CreateTrip />
        <UndoSnackbarHost />
      </>,
    );
    await screen.findByLabelText('Group name');
    await userEvent.type(nameField(), 'An{Enter}');
    await userEvent.click(nameField());
    await userEvent.paste('Bình\nChi');
    expect(await screen.findByText('Added 2 people')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rowNames()).toEqual(['Minh', 'An']);
  });

  it('suggests people with an account and adds their account', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people': [chi],
      'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }),
    });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.type(screen.getByLabelText('Group name'), 'Đà Lạt');
    await userEvent.type(nameField(), 'An{Enter}');
    await userEvent.type(nameField(), 'ch');
    const list = await screen.findByRole('listbox', { name: 'From your recent trips' });
    const option = within(list).getByRole('option', { name: /Chi Trần/ });
    expect(option).toHaveTextContent('Phú Quốc · Hội An');
    await userEvent.click(option);

    expect(screen.getByLabelText('Chi Trần · has an account')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(rowNames()).toEqual(['Minh', 'An', 'Chi Trần']);
    expect(nameField()).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(posted(calls)[0]?.body).toEqual({ name: 'Đà Lạt', myName: 'Minh', people: [{ name: 'An' }, { name: 'Chi Trần', userId: 'u-chi' }], defaultLang: 'en' });
    expect(calls.filter((c) => c.path === '/api/me/people')).toHaveLength(1);
  });

  it('an account cannot be picked twice', async () => {
    mockApi({ 'GET /api/me': me(), 'GET /api/me/people': [chi] });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.type(nameField(), 'ch');
    await userEvent.click(await screen.findByRole('option', { name: /Chi Trần/ }));
    expect(screen.getByLabelText('Chi Trần · has an account')).toBeInTheDocument();

    await userEvent.type(nameField(), 'ch');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Chi Trần' }));
    expect(screen.queryByLabelText('Chi Trần · has an account')).not.toBeInTheDocument();
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'ch');
    expect(await screen.findByRole('option', { name: /Chi Trần/ })).toBeInTheDocument();
  });

  it('warns when a typed name matches a picked account, and the group can still be created', async () => {
    const hint = 'Chi Trần is already on the list with their account.';
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people': [chi],
      'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }),
    });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.type(screen.getByLabelText('Group name'), 'Đà Lạt');
    await userEvent.type(nameField(), 'ch');
    await userEvent.click(await screen.findByRole('option', { name: /Chi Trần/ }));
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    await userEvent.type(nameField(), 'chi tran{Enter}');
    expect(screen.getByText(hint)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(posted(calls)[0]?.body).toEqual({ name: 'Đà Lạt', myName: 'Minh', people: [{ name: 'Chi Trần', userId: 'u-chi' }, { name: 'chi tran' }], defaultLang: 'en' });
  });

  it('the warning goes away when the account row is removed', async () => {
    const hint = 'Chi Trần is already on the list with their account.';
    mockApi({ 'GET /api/me': me(), 'GET /api/me/people': [chi] });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.type(nameField(), 'ch');
    await userEvent.click(await screen.findByRole('option', { name: /Chi Trần/ }));
    await userEvent.type(nameField(), 'CHÍ TRẦN{Enter}');
    expect(screen.getByText(hint)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Chi Trần' }));
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(rowNames()).toEqual(['Minh', 'CHÍ TRẦN']);
  });

  it('a name typed but not added yet is still in the group', async () => {
    const { calls } = mockApi({ 'GET /api/me': me(), 'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }) });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.type(screen.getByLabelText('Group name'), 'Đà Lạt');
    await userEvent.type(nameField(), 'An{Enter}');
    await userEvent.type(nameField(), '  Bình ');
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(posted(calls)[0]?.body).toEqual({ name: 'Đà Lạt', myName: 'Minh', people: [{ name: 'An' }, { name: 'Bình' }], defaultLang: 'en' });
  });

  it('works without suggestions when the list fails to load', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people': () => Response.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, { status: 500 }),
      'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }),
    });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await waitFor(() => expect(calls.some((c) => c.path === '/api/me/people')).toBe(true));
    await userEvent.type(screen.getByLabelText('Group name'), 'Đà Lạt');
    await userEvent.type(nameField(), 'ch');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-9'));
    expect(posted(calls)[0]?.body).toEqual({ name: 'Đà Lạt', myName: 'Minh', people: [{ name: 'ch' }], defaultLang: 'en' });
    expect(calls.filter((c) => c.path === '/api/me/people')).toHaveLength(1);
  });

  it('shows why the trip could not be created next to the button', async () => {
    mockApi({
      'GET /api/me': me(),
      'POST /api/trips': () => Response.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, { status: 500 }),
    });
    renderAt(<CreateTrip />);
    await screen.findByLabelText('Group name');
    await userEvent.type(screen.getByLabelText('Group name'), 'Đà Lạt');
    await userEvent.type(nameField(), 'An{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create group' })).toBeEnabled();
  });
});
