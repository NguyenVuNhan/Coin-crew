import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType, type NavigateFunction } from 'react-router';
import { NavHistoryProvider, useNavEntry } from '../../lib/navHistory';
import { AppNav, type NavSection } from '../AppNav';

let nav: NavigateFunction;

function NavProbe() {
  nav = useNavigate();
  const location = useLocation();
  const type = useNavigationType();
  const { depth } = useNavEntry();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="type">{type}</span>
      <span data-testid="depth">{depth}</span>
    </div>
  );
}

function NavContainer() {
  const location = useLocation();
  const section: NavSection =
    location.pathname === '/trips'
      ? 'home'
      : location.pathname === '/activity'
        ? 'activity'
        : 'groups';
  return (
    <div>
      <NavProbe />
      <AppNav section={section} addHref="/t/1/expenses/new" />
      <Routes>
        <Route path="/groups" element={<div>Groups</div>} />
        <Route path="/trips" element={<div>Trips</div>} />
        <Route path="/activity" element={<div>Activity</div>} />
        <Route path="/t/1" element={<div>Trip 1</div>} />
        <Route path="*" element={<div>Other</div>} />
      </Routes>
    </div>
  );
}

function mount(initialEntries: string[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <NavHistoryProvider>
          <NavContainer />
        </NavHistoryProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AppNav tabs', () => {
  it('tab to tab replaces', () => {
    mount(['/x']);
    act(() => {
      void nav('/groups');
    });
    expect(screen.getByTestId('path')).toHaveTextContent('/groups');
    expect(screen.getByTestId('depth')).toHaveTextContent('1');

    const bar = screen.getByTestId('app-nav-bar');
    fireEvent.click(within(bar).getByTestId('nav-home'));

    expect(screen.getByTestId('path')).toHaveTextContent('/trips');
    expect(screen.getByTestId('type')).toHaveTextContent('REPLACE');
    expect(screen.getByTestId('depth')).toHaveTextContent('1');

    fireEvent.click(within(bar).getByTestId('nav-activity'));

    expect(screen.getByTestId('path')).toHaveTextContent('/activity');
    expect(screen.getByTestId('type')).toHaveTextContent('REPLACE');
    expect(screen.getByTestId('depth')).toHaveTextContent('1');
  });

  it('a tab from a deeper page pushes', () => {
    mount(['/groups']);
    expect(screen.getByTestId('path')).toHaveTextContent('/groups');

    act(() => {
      void nav('/t/1');
    });
    expect(screen.getByTestId('path')).toHaveTextContent('/t/1');

    const bar = screen.getByTestId('app-nav-bar');
    fireEvent.click(within(bar).getByTestId('nav-home'));

    expect(screen.getByTestId('path')).toHaveTextContent('/trips');
    expect(screen.getByTestId('type')).toHaveTextContent('PUSH');

    act(() => {
      void nav(-1);
    });
    expect(screen.getByTestId('path')).toHaveTextContent('/t/1');
  });
});
