import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType, type NavigateFunction } from 'react-router';
import type { ReactNode } from 'react';
import { NavHistoryProvider, useBack, useEntryState, useNavEntry } from '../navHistory';

let nav: NavigateFunction;
let back: () => void;
let setTab: (v: string) => void;

function Probe({ parent }: { parent?: string }) {
  const { depth, openedAs } = useNavEntry();
  const location = useLocation();
  nav = useNavigate();
  back = useBack(parent).goBack;
  return (
    <div>
      <span data-testid="depth">{depth}</span>
      <span data-testid="opened">{openedAs}</span>
      <span data-testid="path">{location.pathname + location.search}</span>
      <span data-testid="type">{useNavigationType()}</span>
    </div>
  );
}

function Tab() {
  const [tab, set] = useEntryState('tab', 'expenses');
  setTab = set;
  return <span data-testid="tab">{tab}</span>;
}

/** Shows the tab only on `/a`, so leaving `/a` unmounts it like a phone page swap. */
function TabOnA() {
  return useLocation().pathname === '/a' ? <Tab /> : null;
}

function mount(entries: Parameters<typeof MemoryRouter>[0]['initialEntries'], children: ReactNode = <Probe parent="/groups" />) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <NavHistoryProvider>{children}</NavHistoryProvider>
    </MemoryRouter>,
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const go = (to: string | number, opts?: { replace?: boolean }) =>
  act(() => {
    if (typeof to === 'number') void nav(to);
    else void nav(to, opts);
  });

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('nav history', () => {
  it('push adds one level', () => {
    mount(['/a']);
    expect(text('depth')).toBe('0');
    go('/b');
    expect(text('depth')).toBe('1');
    expect(text('opened')).toBe('/b');
  });

  it('replace keeps depth 0 on a first-load redirect', () => {
    mount(['/j/x']);
    go('/t/1', { replace: true });
    expect(text('depth')).toBe('0');
    act(() => back());
    expect(text('path')).toBe('/groups');
    expect(text('type')).toBe('REPLACE');
  });

  it('replace keeps the opened-as address', () => {
    mount(['/a']);
    go('/trips?expense=e1');
    go('/trips?expense=e2', { replace: true });
    expect(text('opened')).toBe('/trips?expense=e1');
    expect(text('depth')).toBe('1');
  });

  it('pop reads the stored depth', () => {
    mount(['/a']);
    go('/b');
    go('/c');
    go(-1);
    expect(text('path')).toBe('/b');
    expect(text('depth')).toBe('1');
  });

  it('a reloaded entry keeps its depth', () => {
    sessionStorage.setItem('fsl:nav', JSON.stringify({ k1: { depth: 2, openedAs: '/c', t: 1 } }));
    mount([{ pathname: '/c', key: 'k1' }]);
    expect(text('depth')).toBe('2');
  });

  it('storage that throws counts as depth 0 and back replaces with the parent', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mount([{ pathname: '/c', key: 'k1' }]);
    expect(text('depth')).toBe('0');
    act(() => back());
    expect(text('path')).toBe('/groups');
    expect(text('type')).toBe('REPLACE');
  });

  it('goBack with a page behind goes back one step', () => {
    mount(['/a']);
    go('/b');
    act(() => back());
    expect(text('path')).toBe('/a');
    expect(text('type')).toBe('POP');
  });

  it('a second goBack before the page changes is ignored', () => {
    mount(['/a']);
    go('/b');
    go('/c');
    act(() => {
      back();
      back();
    });
    expect(text('path')).toBe('/b');
  });

  it('entry state survives going back, and a new visit starts fresh', () => {
    mount(['/a'], (
      <>
        <Probe />
        <TabOnA />
      </>
    ));
    act(() => setTab('payments'));
    go('/b');
    expect(screen.queryByTestId('tab')).toBeNull();
    go(-1);
    expect(text('tab')).toBe('payments');
    go('/b');
    go('/a');
    expect(text('tab')).toBe('expenses');
  });

  it('entry state carries over while the page stays mounted', () => {
    mount(['/a'], (
      <>
        <Probe />
        <Tab />
      </>
    ));
    act(() => setTab('payments'));
    go('/a/expenses/1');
    expect(text('tab')).toBe('payments');
    go(-1);
    expect(text('tab')).toBe('payments');
  });

  it('a new page starts at the top and back restores the scroll', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('scrollY', 420);
    mount(['/a']);
    go('/b');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    vi.stubGlobal('scrollY', 0);
    go(-1);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 420);
  });

  it('restore waits until the page is tall enough', async () => {
    vi.useFakeTimers();
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    vi.stubGlobal('innerHeight', 400);
    let height = 2000;
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.stubGlobal('scrollY', 420);
    mount(['/a']);
    go('/b');
    vi.stubGlobal('scrollY', 0);
    height = 500; // the list is still loading
    scrollTo.mockClear();
    go(-1);
    act(() => vi.advanceTimersByTime(16 * 5));
    expect(scrollTo).not.toHaveBeenCalled();
    height = 900; // the list arrived
    act(() => vi.advanceTimersByTime(32));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 420);
    vi.useRealTimers();
  });

  it('prunes to 100 entries', () => {
    mount(['/a']);
    for (let i = 0; i < 120; i++) go(`/p${i}`);
    const stored = JSON.parse(sessionStorage.getItem('fsl:nav') ?? '{}') as Record<string, unknown>;
    expect(Object.keys(stored)).toHaveLength(100);
  });

  it('works without a provider as depth 0', () => {
    render(
      <MemoryRouter initialEntries={['/c']}>
        <Probe parent="/groups" />
      </MemoryRouter>,
    );
    expect(text('depth')).toBe('0');
    act(() => back());
    expect(text('path')).toBe('/groups');
  });
});
