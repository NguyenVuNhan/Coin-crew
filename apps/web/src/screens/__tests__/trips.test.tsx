import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/trips')?.body).toEqual({ name: 'Đà Lạt · Oct 2026', myName: 'Minh', people: ['An', 'Bình'] });
  });
});
