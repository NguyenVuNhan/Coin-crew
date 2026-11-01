import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, renderHook, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { en } from '../i18n/en';
import { vi as viMessages } from '../i18n/vi';
import { t, setLang } from '../i18n';
import { InlineError } from '../components/InlineError';
import { Amount } from '../components/Amount';
import { apiFetch, ApiClientError } from '../api/client';
import { linkTokens } from '../lib/linkTokens';
import { useTripView } from '../api/hooks';

import { Icon } from '../components/icons';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('i18n', () => {
  it('Vietnamese has exactly the English keys', () => expect(Object.keys(viMessages).sort()).toEqual(Object.keys(en).sort()));
  it('uses the spec copy for fewest transfers', () => {
    setLang('en');
    expect(t('fewest.explain')).toBe("We combine everyone's debts so people make as few bank transfers as possible. What each person owes in total stays the same.");
  });
  it('fills variables', () => {
    setLang('en');
    expect(t('who.areYou', { name: 'Bình' })).toBe('Are you Bình?');
  });
  it('defines new wave 0 i18n keys with updated group settings and shuttlecock copy', () => {
    expect((en as Record<string, string>)['sport.shuttlecocks']).toBe('Shuttlecocks');
    expect((viMessages as Record<string, string>)['sport.shuttlecocks']).toBe('Tiền cầu');
    expect((en as Record<string, string>)['settings.title']).toBe('Group settings');
    expect((viMessages as Record<string, string>)['settings.title']).toBe('Cài đặt nhóm');
    expect((en as Record<string, string>)['settings.archive']).toBe('Archive group');
    expect((viMessages as Record<string, string>)['settings.archive']).toBe('Lưu trữ nhóm');

    expect((en as Record<string, string>)['sport.addShuttlecock']).toBe('Add shuttlecock price');
    expect((viMessages as Record<string, string>)['sport.addShuttlecock']).toBe('Thêm tiền cầu');
    expect((en as Record<string, string>)['sport.addExtraFee']).toBe('Add extra fee');
    expect((viMessages as Record<string, string>)['sport.addExtraFee']).toBe('Thêm phụ phí');
    expect((en as Record<string, string>)['sport.bringsGuest']).toBe('This player brings guest?');
    expect((viMessages as Record<string, string>)['sport.bringsGuest']).toBe('Người chơi này có dẫn khách?');
    expect((en as Record<string, string>)['sport.femaleGuest']).toBe('Female guest');
    expect((viMessages as Record<string, string>)['sport.femaleGuest']).toBe('Khách Nữ');
    expect((en as Record<string, string>)['sport.maleGuest']).toBe('Male guest');
    expect((viMessages as Record<string, string>)['sport.maleGuest']).toBe('Khách Nam');
    expect((en as Record<string, string>)['sport.orFixedAmount']).toBe('Or want to set a fixed amount for {name}');
    expect((viMessages as Record<string, string>)['sport.orFixedAmount']).toBe('Hoặc đặt số tiền cố định cho {name}');

    expect((en as Record<string, string>)['account.changePhoto']).toBe('Change photo');
    expect((viMessages as Record<string, string>)['account.changePhoto']).toBe('Đổi ảnh đại diện');
    expect((en as Record<string, string>)['account.cropTitle']).toBe('Crop & adjust photo');
    expect((viMessages as Record<string, string>)['account.cropTitle']).toBe('Cắt & chỉnh ảnh đại diện');
    expect((en as Record<string, string>)['account.zoom']).toBe('Zoom');
    expect((viMessages as Record<string, string>)['account.zoom']).toBe('Thu phóng');
    expect((en as Record<string, string>)['account.saveProfile']).toBe('Save profile');
    expect((viMessages as Record<string, string>)['account.saveProfile']).toBe('Lưu hồ sơ');
    expect((en as Record<string, string>)['account.gender']).toBe('Gender');
    expect((viMessages as Record<string, string>)['account.gender']).toBe('Giới tính');

    expect((en as Record<string, string>)['people.admin']).toBe('Admin');
    expect((viMessages as Record<string, string>)['people.admin']).toBe('Quản trị viên');
    expect((en as Record<string, string>)['people.makeAdmin']).toBe('Make admin');
    expect((viMessages as Record<string, string>)['people.makeAdmin']).toBe('Chỉ định quản trị viên');

    expect((en as Record<string, string>)['expense.historyTitle']).toBe('Edit history');
    expect((viMessages as Record<string, string>)['expense.historyTitle']).toBe('Lịch sử chỉnh sửa');
    expect((en as Record<string, string>)['expense.rollback']).toBe('Roll back to this update');
    expect((viMessages as Record<string, string>)['expense.rollback']).toBe('Khôi phục về bản cập nhật này');

    expect((en as Record<string, string>)['updates.bannerTitle']).toBe('Transactions involving you were updated');
    expect((viMessages as Record<string, string>)['updates.bannerTitle']).toBe('Có giao dịch liên quan đến bạn vừa được cập nhật');
    expect((en as Record<string, string>)['updates.viewAll']).toBe('View updated transactions');
    expect((viMessages as Record<string, string>)['updates.viewAll']).toBe('Xem giao dịch cập nhật');
    expect((en as Record<string, string>)['updates.previous']).toBe('Previous');
    expect((viMessages as Record<string, string>)['updates.previous']).toBe('Trước đó');
    expect((en as Record<string, string>)['updates.now']).toBe('Now');
    expect((viMessages as Record<string, string>)['updates.now']).toBe('Hiện tại');
    expect((en as Record<string, string>)['updates.dismiss']).toBe('Got it');
    expect((viMessages as Record<string, string>)['updates.dismiss']).toBe('Đã hiểu');

    expect((en as Record<string, string>)['activity.adminPromoted']).toBe('{actor} made {name} a group admin');
    expect((viMessages as Record<string, string>)['activity.adminPromoted']).toBe('{actor} đã chỉ định {name} làm quản trị viên nhóm');
    expect((en as Record<string, string>)['activity.expenseRolledBack']).toBe('{actor} rolled back "{description}"');
    expect((viMessages as Record<string, string>)['activity.expenseRolledBack']).toBe('{actor} đã khôi phục "{description}"');
  });
});

describe('new icons', () => {
  it('renders rotateCcw, camera, shield icons', () => {
    const { container: c1 } = render(<Icon name="rotateCcw" />);
    expect(c1.querySelector('svg')?.children.length).toBeGreaterThan(0);
    const { container: c2 } = render(<Icon name="camera" />);
    expect(c2.querySelector('svg')?.children.length).toBeGreaterThan(0);
    const { container: c3 } = render(<Icon name="shield" />);
    expect(c3.querySelector('svg')?.children.length).toBeGreaterThan(0);
  });
});

describe('shared components', () => {
  it('InlineError shows the daily-limit copy', () => {
    setLang('en');
    render(<InlineError error={new ApiClientError('DAILY_LIMIT', 503, 'x')} onRetry={() => {}} />);
    expect(screen.getByText("We're over today's free limit. Try again after 07:00.")).toBeInTheDocument();
  });
  it('InlineError offers a retry for other errors', async () => {
    setLang('en');
    const onRetry = vi.fn();
    render(<InlineError error={new ApiClientError('INTERNAL', 500, 'boom')} onRetry={onRetry} />);
    expect(screen.getByText('Something went wrong. Try again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it('Amount formats VND', () => {
    render(<Amount value={1245000} />);
    expect(screen.getByText('1.245.000₫')).toBeInTheDocument();
  });
});

describe('apiFetch', () => {
  it('sends the stored link token for the trip and turns errors into ApiClientError', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ error: { code: 'LINK_DEAD', message: 'gone' } }, { status: 410 }));
    vi.stubGlobal('fetch', fetchMock);
    linkTokens.set('t1', 'tok-1');
    const err = await apiFetch('/api/trips/t1', { tripId: 't1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ code: 'LINK_DEAD', status: 410 });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('X-Link-Token')).toBe('tok-1');
  });

  it('remembers a new device id and sends it back for restoring', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-1' } }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/health');
    await apiFetch('/api/health');
    const second = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(new Headers(second.headers).get('X-Device-Restore')).toBe('dev-1');
  });
});

describe('useTripView', () => {
  function mockTrip() {
    const state = { version: 1, versionCalls: 0 };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/version')) {
        state.versionCalls++;
        return Response.json({ version: state.version });
      }
      return Response.json({ trip: { id: 't1', version: state.version } });
    }));
    return state;
  }

  it('refetches the view when the version changes', async () => {
    const state = mockTrip();
    const { result } = renderHook(() => useTripView('t1', 30), { wrapper });
    await waitFor(() => expect(result.current.view?.trip.version).toBe(1));
    state.version = 2;
    await waitFor(() => expect(result.current.view?.trip.version).toBe(2));
  });

  it('does not poll while the page is hidden', async () => {
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const state = mockTrip();
    const { result } = renderHook(() => useTripView('t1', 20), { wrapper });
    await waitFor(() => expect(result.current.view).toBeDefined());
    await new Promise((r) => setTimeout(r, 150));
    expect(state.versionCalls).toBe(0);
    spy.mockRestore();
  });

  it('resumes by itself when the page becomes visible again', async () => {
    mockTrip();
    let visibility: DocumentVisibilityState = 'visible';
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const { result } = renderHook(() => useTripView('t1', 20, { stopAfterMs: 100 }), { wrapper });
    await waitFor(() => expect(result.current.stopped).toBe(true), { timeout: 1000 });
    act(() => {
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => {
      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.stopped).toBe(false);
    spy.mockRestore();
  });

  it('stops after stopAfterMs and resumes on request', async () => {
    mockTrip();
    const { result } = renderHook(() => useTripView('t1', 20, { stopAfterMs: 100 }), { wrapper });
    await waitFor(() => expect(result.current.stopped).toBe(true), { timeout: 1000 });
    act(() => result.current.resume());
    expect(result.current.stopped).toBe(false);
  });
});
