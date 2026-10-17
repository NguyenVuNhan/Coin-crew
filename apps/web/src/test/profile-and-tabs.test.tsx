import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { renderAt, mockApi } from './render';
import { mockMedia } from './media';
import { tripView, guestChiView, viewerView, PIDS } from './fixtures';
import { Avatar } from '../components/Avatar';
import { AvatarCropModal } from '../components/AvatarCropModal';
import { AccountMenu } from '../components/AccountMenu';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { MemberTrip } from '../screens/MemberTrip';
import { GuestTrip } from '../screens/GuestTrip';
import { ViewOnlyTrip } from '../screens/ViewOnlyTrip';
import { Settings } from '../screens/Settings';
import { TripRoute } from '../screens/TripRoute';
import { CreateTrip } from '../screens/CreateTrip';
import { InviteSheet } from '../components/InviteSheet';
import { setLang, getLang } from '../i18n';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  setLang('en');
});

describe('Task 4: Avatar and AvatarCropModal', () => {
  it('Avatar renders img when avatarUrl is provided', () => {
    const { container } = render(<Avatar name="Minh Nguyen" avatarUrl="https://example.com/avatar.jpg" size="sm" />);
    const img = container.querySelector('img.fsl-avatar__img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    expect(img).toHaveAttribute('alt', '');
  });

  it('Avatar falls back to initial character when avatarUrl is null or empty', () => {
    const { container, rerender } = render(<Avatar name="Minh Nguyen" avatarUrl={null} size="md" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('N');

    rerender(<Avatar name="Minh Nguyen" avatarUrl="" size="md" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('N');
  });

  it('AvatarCropModal renders circular viewport, zoom slider, and emits onSave', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <AvatarCropModal
        open={true}
        imageSrc="data:image/png;base64,fakeimage"
        onSave={onSave}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Crop & adjust photo' })).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Zoom' });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('step', '0.05');

    // Zoom slider adjusts value
    fireEvent.change(slider, { target: { value: '1.5' } });
    expect(slider).toHaveValue('1.5');

    // Save button invokes onSave
    const saveBtn = screen.getByRole('button', { name: 'Save photo' });
    await userEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalled();
  });
});

describe('Task 4: AccountMenu Profile Editor & Auto-fetch', () => {
  it('AccountMenu fetches user from /api/me when user prop is omitted', async () => {
    const meUser = {
      id: 'u-1',
      name: 'Minh',
      email: 'minh@example.com',
      avatarUrl: 'https://example.com/minh.png',
      gender: 'M' as const,
      consentAt: '2026-10-10',
    };
    mockApi({
      'GET /api/me': { user: meUser },
    });

    renderAt(<AccountMenu />);
    const trigger = await screen.findByRole('button', { name: /Account/ });
    expect(trigger.querySelector('img')).toHaveAttribute('src', 'https://example.com/minh.png');

    await userEvent.click(trigger);
    const menu = screen.getByRole('dialog', { name: /Account/ });
    expect(within(menu).getByDisplayValue('Minh')).toBeInTheDocument();
  });

  it('AccountMenu updates display name and gender via PATCH /api/me', async () => {
    const meUser = {
      id: 'u-1',
      name: 'Minh',
      email: 'minh@example.com',
      avatarUrl: null,
      gender: 'M' as const,
      consentAt: '2026-10-10',
    };
    const { calls } = mockApi({
      'GET /api/me': { user: meUser },
      'PATCH /api/me': { user: { ...meUser, name: 'Minh Pro', gender: 'F' } },
    });

    renderAt(<AccountMenu />);
    const trigger = await screen.findByRole('button', { name: /Account/ });
    await userEvent.click(trigger);

    const nameInput = screen.getByLabelText('Display name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Minh Pro');

    const femaleRadio = screen.getByRole('radio', { name: 'Female' });
    await userEvent.click(femaleRadio);

    const saveBtn = screen.getByRole('button', { name: 'Save profile' });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      const patchCall = calls.find((c) => c.method === 'PATCH' && c.path === '/api/me');
      expect(patchCall).toBeDefined();
      expect(patchCall?.body).toMatchObject({
        name: 'Minh Pro',
        gender: 'F',
      });
    });
  });

  it('AccountMenu allows removing photo when avatarUrl exists', async () => {
    const meUser = {
      id: 'u-1',
      name: 'Minh',
      email: 'minh@example.com',
      avatarUrl: 'https://example.com/photo.png',
      gender: 'M' as const,
      consentAt: '2026-10-10',
    };
    const { calls } = mockApi({
      'GET /api/me': { user: meUser },
      'PATCH /api/me': { user: { ...meUser, avatarUrl: null } },
    });

    renderAt(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: /Account/ }));

    const removeBtn = screen.getByRole('button', { name: 'Remove photo' });
    await userEvent.click(removeBtn);

    await waitFor(() => {
      const patchCall = calls.find((c) => c.method === 'PATCH' && c.path === '/api/me');
      expect(patchCall).toBeDefined();
      expect(patchCall?.body).toMatchObject({ avatarUrl: null });
    });
  });
});

describe('Task 4: Screen titleAlign prop', () => {
  it('Screen adds modifier class fsl-screen__header--title-left when titleAlign="left"', () => {
    const { container, rerender } = render(<Screen title="Test Title" titleAlign="left" />);
    expect(container.querySelector('.fsl-screen__header--title-left')).toBeInTheDocument();

    rerender(<Screen title="Test Title" titleAlign="center" />);
    expect(container.querySelector('.fsl-screen__header--title-left')).toBeNull();
  });
});

describe('Task 4: 2-Tab Group View on narrow screen', () => {
  it('MemberTrip has left titleAlign, AccountMenu in header, and 2 tabs switching Expenses and Payments', async () => {
    mockMedia({ wide: false });
    mockApi({
      'GET /api/me': { user: { id: 'u-1', name: 'Minh', email: 'm@ex.com', avatarUrl: null, consentAt: null } },
    });
    const view = tripView({
      payments: [
        {
          id: 'pay-1',
          fromId: PIDS.C,
          toId: PIDS.M,
          amountClaimed: 500000,
          amountConfirmed: null,
          status: 'says_paid',
          notArrived: false,
          createdAt: '2026-10-10',
        },
      ],
    });

    const { container } = renderAt(<MemberTrip view={view} />);
    // Check titleAlign="left" modifier
    expect(container.querySelector('.fsl-screen__header--title-left')).toBeInTheDocument();

    // Check tabs
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    const expensesTab = within(tablist).getByRole('tab', { name: 'Expenses' });
    const paymentsTab = within(tablist).getByRole('tab', { name: 'Payments' });

    expect(expensesTab).toHaveAttribute('aria-selected', 'true');
    expect(paymentsTab).toHaveAttribute('aria-selected', 'false');

    // Expenses list is visible initially
    expect(screen.getByRole('region', { name: /expenses/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /payments/i })).toBeNull();

    // Bottom bar "+ Add expense" is visible
    expect(screen.getByRole('link', { name: '+ Add expense' })).toBeInTheDocument();

    // Switch to Payments tab
    await userEvent.click(paymentsTab);
    expect(expensesTab).toHaveAttribute('aria-selected', 'false');
    expect(paymentsTab).toHaveAttribute('aria-selected', 'true');

    // Payments list is visible now
    expect(screen.getByRole('region', { name: /payments/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /expenses/i })).toBeNull();

    // Sticky "+ Add expense" remains visible on payments tab
    expect(screen.getByRole('link', { name: '+ Add expense' })).toBeInTheDocument();
  });

  it('GuestTrip and ViewOnlyTrip render tabs on narrow screen', async () => {
    mockMedia({ wide: false });
    const guestView = guestChiView();
    const { unmount } = renderAt(<GuestTrip view={guestView} />);

    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Expenses' })).toHaveAttribute('aria-selected', 'true');
    unmount();

    const viewOnly = viewerView();
    renderAt(<ViewOnlyTrip view={viewOnly} />);
    const voTablist = screen.getByRole('tablist');
    expect(voTablist).toBeInTheDocument();
  });
});

describe('Task 4: Settings cleanup', () => {
  it('Settings does not render Bank or Language rows', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<Settings />, { route: '/t/t-1/settings', path: '/t/:tripId/settings' });

    expect(await screen.findByRole('link', { name: 'People' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Activity' })).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Your bank details' })).toBeNull();
    expect(screen.queryByText('Language')).toBeNull();
    expect(screen.queryByRole('button', { name: /Switch to/ })).toBeNull();
  });
});

describe('Task 4: LanguageButton & Language inheritance', () => {
  it('LanguageButton renders icon size 18 and visible language label', () => {
    render(<LanguageButton />);
    const label = screen.getByText('English');
    expect(label).toHaveClass('fsl-lang-btn__label');
  });

  it('TripRoute inherits defaultLang="en" when fsl_lang is not set', async () => {
    localStorage.clear();
    setLang('vi'); // Start in Vietnamese
    const view = tripView({ trip: { ...tripView().trip, defaultLang: 'en' } });
    mockApi({ 'GET /api/trips/t-1': view });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/t/t-1']}>
          <Routes>
            <Route path="/t/:tripId" element={<TripRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByRole('tablist');
    expect(getLang()).toBe('en');
  });

  it('TripRoute does not override language when fsl_lang is set', async () => {
    localStorage.setItem('fsl_lang', 'vi');
    setLang('vi');
    const view = tripView({ trip: { ...tripView().trip, defaultLang: 'en' } });
    mockApi({ 'GET /api/trips/t-1': view });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/t/t-1']}>
          <Routes>
            <Route path="/t/:tripId" element={<TripRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByRole('tablist');
    expect(getLang()).toBe('vi');
  });

  it('CreateTrip passes defaultLang in payload', async () => {
    setLang('vi');
    const { calls } = mockApi({
      'GET /api/me': { user: { id: 'u-1', name: 'Minh', email: 'm@ex.com', consentAt: '2026-10-10' } },
      'GET /api/me/people': [],
      'POST /api/trips': { tripId: 't-new' },
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/trips/new']}>
          <Routes>
            <Route path="/trips/new" element={<CreateTrip />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const tripNameInput = await screen.findByLabelText(/Tên nhóm|Group name/);
    await userEvent.type(tripNameInput, 'Badminton Club');

    const personInput = screen.getByLabelText(/Name 1|Tên 1/);
    await userEvent.type(personInput, 'Chi');

    const submitBtn = screen.getByRole('button', { name: /Tạo nhóm|Create group/ });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      const postCall = calls.find((c) => c.method === 'POST' && c.path === '/api/trips');
      expect(postCall).toBeDefined();
      expect(postCall?.body).toMatchObject({
        name: 'Badminton Club',
        defaultLang: 'vi',
      });
    });
  });

  it('InviteSheet appends ?lang={lang} to invite links', () => {
    setLang('vi');
    const view = tripView({ links: { group: 'gtok-1', view: 'vtok-1' } });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <InviteSheet view={view} open={true} onClose={() => {}} />
      </QueryClientProvider>
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs[0]).toHaveValue(`${location.origin}/j/gtok-1?lang=vi`);
    expect(inputs[1]).toHaveValue(`${location.origin}/j/vtok-1?lang=vi`);
  });
});
