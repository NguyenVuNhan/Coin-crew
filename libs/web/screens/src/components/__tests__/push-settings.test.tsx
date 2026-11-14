// @vitest-environment jsdom
import '../../test/setup';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLang } from '@cc/web-i18n';
import type { PushDeviceSettings } from '@cc/core';
import type { PushState } from '@cc/web-platform/push';
import { mockApi, renderAt } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { NotificationSettingsModal } from '../NotificationSettingsModal';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/dev-1';

const DEFAULT_DEVICE: PushDeviceSettings = {
  newSession: true,
  sessionReminder: true,
  reminderLeadMinutes: 30,
  expenseNew: true,
};

const pushMocks = vi.hoisted(() => ({
  usePushState: vi.fn<() => PushState>(() => 'not-asked'),
  getBrowserSubscription: vi.fn<() => Promise<{ endpoint: string } | null>>(async () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
  })),
  subscribeBrowser: vi.fn<(key: string) => Promise<PushSubscriptionJSON>>(async () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  })),
}));

vi.mock('@cc/web-platform/push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-platform/push')>();
  return {
    ...actual,
    usePushState: () => pushMocks.usePushState(),
    getBrowserSubscription: () => pushMocks.getBrowserSubscription(),
    subscribeBrowser: (key: string) => pushMocks.subscribeBrowser(key),
  };
});

beforeEach(() => {
  vi.stubGlobal('__APP_VERSION__', 'test-1.0.0');
  pushMocks.usePushState.mockReturnValue('not-asked');
  pushMocks.getBrowserSubscription.mockResolvedValue({ endpoint: ENDPOINT });
  pushMocks.subscribeBrowser.mockResolvedValue({
    endpoint: ENDPOINT,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

function renderModal(opts: { email?: string | null; zmp?: boolean; viLang?: boolean } = {}) {
  const platform = opts.zmp ? fakePlatform({ kind: 'zmp' }) : undefined;
  const view = renderAt(
    <NotificationSettingsModal
      open={true}
      onClose={vi.fn()}
      user={{ name: 'An', email: opts.email !== undefined ? opts.email : 'an@example.com' }}
    />,
    platform ? { platform } : {},
  );
  if (opts.viLang !== false) {
    act(() => {
      setLang('vi');
    });
  }
  return view;
}

describe('PushSettingsGroup in NotificationSettingsModal', () => {
  it('renders unsupported state with fsl-push-settings--unsupported modifier and key text', async () => {
    pushMocks.usePushState.mockReturnValue('unsupported');
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();

    const group = await screen.findByTestId('push-settings');
    expect(group).toHaveClass('fsl-push-settings', 'fsl-push-settings--unsupported');
    expect(screen.getByText('Trên điện thoại này')).toBeInTheDocument();
    expect(screen.getByText('Chỉ áp dụng cho điện thoại này.')).toBeInTheDocument();
    expect(
      screen.getByText('Trình duyệt này không gửi được thông báo. Mở CoinCrew bằng Chrome hoặc Safari để bật.'),
    ).toBeInTheDocument();
  });

  it('renders ios-needs-install state and opens InstallAppSheet when tapped', async () => {
    const user = userEvent.setup();
    pushMocks.usePushState.mockReturnValue('ios-needs-install');
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();

    const group = await screen.findByTestId('push-settings');
    expect(group).toHaveClass('fsl-push-settings', 'fsl-push-settings--ios-needs-install');
    expect(screen.getByText('Thêm vào màn hình chính trước')).toBeInTheDocument();
    expect(
      screen.getByText('iPhone chỉ gửi thông báo khi mở CoinCrew từ màn hình chính'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Thêm vào màn hình chính trước/i }));
    expect(await screen.findByTestId('install-sheet')).toBeInTheDocument();
  });

  it('renders not-asked state, disables enable button until server key loads, and enables push on click', async () => {
    const user = userEvent.setup();
    pushMocks.usePushState.mockReturnValue('not-asked');

    let resolveKey!: (res: Response) => void;
    const keyPromise = new Promise<Response>((r) => {
      resolveKey = r;
    });

    const { calls } = mockApi({
      'GET /api/push/key': () => keyPromise,
      'PUT /api/push/subscription': { settings: DEFAULT_DEVICE },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();

    const group = screen.getByTestId('push-settings');
    expect(group).toHaveClass('fsl-push-settings', 'fsl-push-settings--not-asked');
    expect(screen.getByText('Bật thông báo trên điện thoại này')).toBeInTheDocument();
    expect(screen.getByText('Buổi chơi, lời nhắc và khoản chi có bạn')).toBeInTheDocument();

    const enableBtn = screen.getByRole('button', { name: 'Bật thông báo' });
    expect(enableBtn).toBeDisabled();

    await act(async () => {
      resolveKey(Response.json({ publicKey: 'AQAB' }));
    });

    await waitFor(() => {
      expect(enableBtn).toBeEnabled();
    });

    await user.click(enableBtn);

    await waitFor(() => {
      expect(pushMocks.subscribeBrowser).toHaveBeenCalledWith('AQAB');
      const putCall = calls.find((c) => c.method === 'PUT' && c.path === '/api/push/subscription');
      expect(putCall?.body).toEqual({
        endpoint: ENDPOINT,
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      });
    });
  });

  it('renders blocked state with fsl-push-settings--blocked modifier and three steps', async () => {
    pushMocks.usePushState.mockReturnValue('blocked');
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();

    const group = await screen.findByTestId('push-settings');
    expect(group).toHaveClass('fsl-push-settings', 'fsl-push-settings--blocked');
    expect(screen.getByText('Điện thoại đang chặn thông báo của CoinCrew')).toBeInTheDocument();
    expect(screen.getByText('Mở Cài đặt của điện thoại')).toBeInTheDocument();
    expect(screen.getByText('Chọn Thông báo → CoinCrew')).toBeInTheDocument();
    expect(screen.getByText('Bật Cho phép thông báo, rồi quay lại đây')).toBeInTheDocument();
  });

  it('renders granted state with three switches when device row exists, and falls back to not-asked UI when device row is missing', async () => {
    pushMocks.usePushState.mockReturnValue('granted');
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/push/subscription': () =>
        Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 }),
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    const { unmount } = renderModal();

    const groupNoSub = await screen.findByTestId('push-settings');
    expect(groupNoSub).toHaveClass('fsl-push-settings', 'fsl-push-settings--granted');
    expect(screen.getByText('Bật thông báo trên điện thoại này')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bật thông báo' })).toBeInTheDocument();

    unmount();

    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/push/subscription': { settings: DEFAULT_DEVICE },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();

    const groupWithSub = await screen.findByTestId('push-settings');
    expect(groupWithSub).toHaveClass('fsl-push-settings', 'fsl-push-settings--granted');

    const newSessionSw = await screen.findByTestId('push-switch-newSession');
    const reminderSw = screen.getByTestId('push-switch-sessionReminder');
    const expenseSw = screen.getByTestId('push-switch-expenseNew');

    expect(newSessionSw).toBeChecked();
    expect(reminderSw).toBeChecked();
    expect(expenseSw).toBeChecked();

    expect(screen.getByText('Buổi chơi mới có tên bạn')).toBeInTheDocument();
    expect(screen.getByText('Khi admin thêm bạn vào buổi chơi')).toBeInTheDocument();
    expect(screen.getByText('Nhắc trước buổi chơi')).toBeInTheDocument();
    expect(screen.getByText('30 phút trước giờ bắt đầu')).toBeInTheDocument();
    expect(screen.getByText('Khoản chi mới tính phần của bạn')).toBeInTheDocument();
  });

  it('hidden when state is hidden', () => {
    pushMocks.usePushState.mockReturnValue('hidden');
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();
    expect(screen.queryByTestId('push-settings')).toBeNull();
  });

  it('hidden in zmp', () => {
    pushMocks.usePushState.mockReturnValue('not-asked');
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal({ zmp: true });
    expect(screen.queryByTestId('push-settings')).toBeNull();
  });

  it('hidden without a server key', async () => {
    pushMocks.usePushState.mockReturnValue('not-asked');
    mockApi({
      'GET /api/push/key': { publicKey: null },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();
    await waitFor(() => {
      expect(screen.queryByTestId('push-settings')).toBeNull();
    });
  });

  it('toggling expenseNew PATCHes the device', async () => {
    const user = userEvent.setup();
    pushMocks.usePushState.mockReturnValue('granted');
    const { calls } = mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/push/subscription': { settings: DEFAULT_DEVICE },
      'PATCH /api/push/subscription': (init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return Response.json({ settings: { ...DEFAULT_DEVICE, ...body } });
      },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();

    const expenseSw = await screen.findByTestId('push-switch-expenseNew');
    expect(expenseSw).toBeChecked();

    await user.click(expenseSw);

    await waitFor(() => {
      const patchCall = calls.find((c) => c.method === 'PATCH' && c.path === '/api/push/subscription');
      expect(patchCall?.body).toEqual({
        endpoint: ENDPOINT,
        expenseNew: false,
      });
    });
  });

  it('lead select shows only when reminder is on and PATCHes reminderLeadMinutes 60', async () => {
    const user = userEvent.setup();
    pushMocks.usePushState.mockReturnValue('granted');
    let currentSettings = { ...DEFAULT_DEVICE };
    const { calls } = mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/push/subscription': () => Response.json({ settings: currentSettings }),
      'PATCH /api/push/subscription': (init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const { endpoint: _ep, ...rest } = body;
        currentSettings = { ...currentSettings, ...rest };
        return Response.json({ settings: currentSettings });
      },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();

    const leadSelect = await screen.findByTestId('push-lead');
    expect(leadSelect).toBeInTheDocument();

    await user.click(leadSelect);
    const option60 = await screen.findByRole('option', { name: '1 giờ' });
    await user.click(option60);

    await waitFor(() => {
      const patchCall = calls.find(
        (c) =>
          c.method === 'PATCH' &&
          c.path === '/api/push/subscription' &&
          (c.body as { reminderLeadMinutes?: number })?.reminderLeadMinutes === 60,
      );
      expect(patchCall?.body).toEqual({
        endpoint: ENDPOINT,
        reminderLeadMinutes: 60,
      });
    });

    expect(await screen.findByText('1 giờ trước giờ bắt đầu')).toBeInTheDocument();

    // Toggle reminder switch off -> lead select disappears
    const reminderSw = screen.getByTestId('push-switch-sessionReminder');
    await user.click(reminderSw);

    await waitFor(() => {
      expect(screen.queryByTestId('push-lead')).toBeNull();
    });
  });

  it('re-reads state on visibilitychange', async () => {
    let currentState: PushState = 'granted';
    pushMocks.usePushState.mockImplementation(() => currentState);
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/push/subscription': { settings: DEFAULT_DEVICE },
      'GET /api/me/notifications': {
        settings: { transactionCrud: true, loanReminders: true, monthlyNotice: true },
      },
    });

    renderModal();

    const group = await screen.findByTestId('push-settings');
    expect(group).toHaveClass('fsl-push-settings--granted');

    currentState = 'blocked';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('push-settings')).toHaveClass('fsl-push-settings--blocked');
      expect(screen.getByText('Điện thoại đang chặn thông báo của CoinCrew')).toBeInTheDocument();
    });
  });

  it('sheet title is Thông báo and the no-email warning sits inside the email list', async () => {
    pushMocks.usePushState.mockReturnValue('not-asked');
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    renderModal({ email: null });

    expect(screen.getByRole('heading', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.getByText('Qua email')).toBeInTheDocument();

    const emailList = document.querySelector('.fsl-notification-settings__list');
    const warning = document.querySelector('.fsl-notification-settings__warning');
    expect(emailList).not.toBeNull();
    expect(warning).not.toBeNull();
    expect(emailList?.contains(warning)).toBe(true);
  });
});
