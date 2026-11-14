// @vitest-environment jsdom
import '../../test/setup';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLang } from '@cc/web-i18n';
import type { InstallContext } from '@cc/web-platform/install';
import type { PushState } from '@cc/web-platform/push';
import { mockApi, renderAt } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';

const installMock = vi.hoisted(() => ({
  context: 'standalone' as InstallContext,
  mobile: true,
  installed: true,
  prompt: vi.fn(),
}));

const pushMock = vi.hoisted(() => ({
  state: 'not-asked' as PushState,
  getBrowserSubscription: vi.fn<() => Promise<{ endpoint: string } | null>>(async () => null),
  subscribeBrowser: vi.fn<(key: string) => Promise<PushSubscriptionJSON>>(async () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  })),
}));

vi.mock('@cc/web-platform/install', async (orig) => {
  const actual = await orig<typeof import('@cc/web-platform/install')>();
  return {
    ...actual,
    useInstallPrompt: () => ({
      context: installMock.context,
      mobile: installMock.mobile,
      installed: installMock.installed,
      prompt: installMock.prompt,
    }),
  };
});

vi.mock('@cc/web-platform/push', async (orig) => {
  const actual = await orig<typeof import('@cc/web-platform/push')>();
  return {
    ...actual,
    usePushState: () => pushMock.state,
    getBrowserSubscription: () => pushMock.getBrowserSubscription(),
    subscribeBrowser: (key: string) => pushMock.subscribeBrowser(key),
  };
});

import { __resetInstallVisitForTests } from '../InstallPill';
import { PushPill } from '../PushPill';
import { PushAskSheet } from '../PushAskSheet';

const USER = { user: { id: 'u1', name: 'An', email: null, avatarUrl: null } };
const DEVICE = {
  newSession: true,
  sessionReminder: true,
  reminderLeadMinutes: 30,
  expenseNew: true,
};

beforeEach(() => {
  localStorage.clear();
  __resetInstallVisitForTests();
  installMock.context = 'standalone';
  installMock.mobile = true;
  installMock.installed = true;
  pushMock.state = 'not-asked';
  pushMock.getBrowserSubscription.mockResolvedValue(null);
  pushMock.subscribeBrowser.mockResolvedValue({
    endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  });
  act(() => {
    setLang('vi');
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderVi(ui: Parameters<typeof renderAt>[0], opts?: Parameters<typeof renderAt>[1]) {
  const view = renderAt(ui, opts);
  act(() => {
    setLang('vi');
  });
  return view;
}

describe('PushPill & PushAskSheet', () => {
  it('shows on the second signed-in visit when push is not asked', async () => {
    localStorage.setItem('cc.install.visits', '1');
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    renderVi(<PushPill />);

    const pill = await screen.findByTestId('push-pill');
    expect(pill).toHaveClass('fsl-push-pill');
    expect(screen.getByText('Nhận thông báo trên điện thoại')).toBeInTheDocument();
  });

  it('hidden on the first visit', async () => {
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    renderVi(<PushPill />);

    await waitFor(() => expect(localStorage.getItem('cc.install.visits')).toBe('1'));
    expect(screen.queryByTestId('push-pill')).toBeNull();
  });

  it('hidden while the install pill shows', async () => {
    localStorage.setItem('cc.install.visits', '1');
    installMock.context = 'ios-safari';
    installMock.installed = false;
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    renderVi(<PushPill />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('push-pill')).toBeNull();
  });

  it('hidden after ✕ and stays hidden after remount', async () => {
    localStorage.setItem('cc.install.visits', '1');
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    const { unmount } = renderVi(<PushPill />);
    await screen.findByTestId('push-pill');

    const close = document.querySelector('.fsl-push-pill__close') as HTMLElement;
    expect(close).toBeTruthy();
    expect(close.getAttribute('aria-label')).toBe('Bỏ qua');
    await userEvent.click(close);

    await waitFor(() => expect(screen.queryByTestId('push-pill')).toBeNull());
    expect(localStorage.getItem('cc.push.dismissed')).toBe('1');

    unmount();
    renderVi(<PushPill />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('push-pill')).toBeNull();
  });

  it('hidden in zmp', async () => {
    localStorage.setItem('cc.install.visits', '2');
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    renderVi(<PushPill />, { platform: fakePlatform({ kind: 'zmp' }) });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('push-pill')).toBeNull();
  });

  it('hidden when state is blocked', async () => {
    localStorage.setItem('cc.install.visits', '2');
    pushMock.state = 'blocked';
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    renderVi(<PushPill />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('push-pill')).toBeNull();
  });

  it('hidden when server push key is null', async () => {
    localStorage.setItem('cc.install.visits', '2');
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: null },
    });

    renderVi(<PushPill />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('push-pill')).toBeNull();
  });

  it('shows when state is granted with no device row, and hides when device row exists', async () => {
    localStorage.setItem('cc.install.visits', '2');
    pushMock.state = 'granted';
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    const first = renderVi(<PushPill />);
    expect(await screen.findByTestId('push-pill')).toBeInTheDocument();
    first.unmount();

    pushMock.getBrowserSubscription.mockResolvedValue({
      endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
    });
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
      'GET /api/push/subscription': { settings: DEVICE },
    });

    renderVi(<PushPill />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('push-pill')).toBeNull();
  });

  it('tapping opens the ask sheet; Để sau closes it and the pill stays', async () => {
    localStorage.setItem('cc.install.visits', '1');
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    renderVi(<PushPill />);
    const pill = await screen.findByTestId('push-pill');
    await userEvent.click(pill.querySelector('button:not(.fsl-push-pill__close)')!);

    const sheet = await screen.findByTestId('push-ask-sheet');
    expect(sheet).toHaveClass('fsl-push-ask');
    expect(screen.getByText('Buổi chơi mới có tên bạn')).toBeInTheDocument();
    expect(screen.getByText('Khi admin lên lịch buổi chơi và thêm bạn vào danh sách')).toBeInTheDocument();
    expect(screen.getByText('Nhắc trước buổi chơi')).toBeInTheDocument();
    expect(screen.getByText('30 phút trước giờ bắt đầu')).toBeInTheDocument();
    expect(screen.getByText('Thay đổi giao dịch')).toBeInTheDocument();
    expect(screen.getByText('Khi có khoản chi mới tính phần của bạn')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    await waitFor(() => expect(screen.queryByTestId('push-ask-sheet')).toBeNull());
    expect(screen.getByTestId('push-pill')).toBeInTheDocument();
  });

  it('Bật thông báo subscribes, shows Đã bật thông báo, and the pill disappears', async () => {
    localStorage.setItem('cc.install.visits', '1');
    pushMock.subscribeBrowser.mockImplementation(async () => {
      pushMock.state = 'granted';
      pushMock.getBrowserSubscription.mockResolvedValue({
        endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
      });
      return {
        endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      };
    });
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
      'PUT /api/push/subscription': { settings: DEVICE },
      'GET /api/push/subscription': { settings: DEVICE },
    });

    renderVi(<PushPill />);
    const pill = await screen.findByTestId('push-pill');
    await userEvent.click(pill.querySelector('button:not(.fsl-push-pill__close)')!);

    const enableBtn = await screen.findByRole('button', { name: 'Bật thông báo' });
    await waitFor(() => expect(enableBtn).not.toBeDisabled());
    await userEvent.click(enableBtn);

    expect(pushMock.subscribeBrowser).toHaveBeenCalledWith('AQAB');
    expect(await screen.findByRole('status')).toHaveTextContent('Đã bật thông báo');
    await waitFor(() => expect(screen.queryByTestId('push-ask-sheet')).toBeNull());
    await waitFor(() => expect(screen.queryByTestId('push-pill')).toBeNull());
  });

  it('subscribe failure shows an inline error and retries', async () => {
    localStorage.setItem('cc.install.visits', '1');
    pushMock.subscribeBrowser.mockRejectedValueOnce(new Error('Network error'));
    mockApi({
      'GET /api/me': USER,
      'GET /api/push/key': { publicKey: 'AQAB' },
      'PUT /api/push/subscription': { settings: DEVICE },
    });

    renderVi(<PushPill />);
    const pill = await screen.findByTestId('push-pill');
    await userEvent.click(pill.querySelector('button:not(.fsl-push-pill__close)')!);

    const enableBtn = await screen.findByRole('button', { name: 'Bật thông báo' });
    await waitFor(() => expect(enableBtn).not.toBeDisabled());
    await userEvent.click(enableBtn);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('push-ask-sheet')).toBeInTheDocument();

    // Retry succeeds
    await userEvent.click(enableBtn);
    expect(await screen.findByRole('status')).toHaveTextContent('Đã bật thông báo');
  });

  it('disables Bật thông báo until push key is loaded', async () => {
    mockApi({
      'GET /api/push/key': new Promise(() => {}),
    });

    renderVi(<PushAskSheet open={true} onClose={vi.fn()} />);

    const sheet = await screen.findByTestId('push-ask-sheet');
    expect(sheet).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bật thông báo' })).toBeDisabled();
  });

  it('closes the sheet when permission is denied', async () => {
    const onClose = vi.fn();
    pushMock.subscribeBrowser.mockRejectedValueOnce(new Error('Notification permission denied'));
    mockApi({
      'GET /api/push/key': { publicKey: 'AQAB' },
    });

    renderVi(<PushAskSheet open={true} onClose={onClose} />);

    const enableBtn = await screen.findByRole('button', { name: 'Bật thông báo' });
    await waitFor(() => expect(enableBtn).not.toBeDisabled());
    await userEvent.click(enableBtn);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
