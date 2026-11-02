import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType, type NavigateFunction } from 'react-router';
import type { ReactNode } from 'react';
import { NavHistoryProvider, useNavEntry } from '../../lib/navHistory';
import { renderAt } from '../../test/render';
import { Screen } from '../Screen';

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

function mount(initialEntries: string[], extraRoutes?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavHistoryProvider>
        <NavProbe />
        <Routes>
          <Route path="/x" element={<Screen title="X" />} />
          <Route path="/y" element={<Screen title="Y" back="/groups" />} />
          <Route path="/z" element={<Screen title="Z" back="/groups" />} />
          <Route path="/groups" element={<Screen title="Groups" />} />
          <Route path="/g" element={<Screen title="G" backInApp />} />
          {extraRoutes}
        </Routes>
      </NavHistoryProvider>
    </MemoryRouter>,
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

describe('Screen back navigation', () => {
  it('back link keeps its href', () => {
    renderAt(<Screen title="Test" back="/groups" />);
    const link = screen.getByRole('link', { name: 'Back' });
    expect(link).toHaveAttribute('href', '/groups');
  });

  it('with a page behind, back goes back in history', () => {
    mount(['/x']);
    expect(screen.getByTestId('path')).toHaveTextContent('/x');

    act(() => {
      void nav('/y');
    });
    expect(screen.getByTestId('path')).toHaveTextContent('/y');

    const link = screen.getByRole('link', { name: 'Back' });
    fireEvent.click(link);

    expect(screen.getByTestId('path')).toHaveTextContent('/x');
    expect(screen.getByTestId('type')).toHaveTextContent('POP');
  });

  it('with nothing behind, back replaces with the parent', () => {
    mount(['/y']);
    expect(screen.getByTestId('path')).toHaveTextContent('/y');

    const link = screen.getByRole('link', { name: 'Back' });
    fireEvent.click(link);

    expect(screen.getByTestId('path')).toHaveTextContent('/groups');
    expect(screen.getByTestId('type')).toHaveTextContent('REPLACE');
  });

  it('a double tap goes back one page', () => {
    mount(['/x']);
    act(() => {
      void nav('/y');
    });
    act(() => {
      void nav('/z');
    });
    expect(screen.getByTestId('path')).toHaveTextContent('/z');

    const link = screen.getByRole('link', { name: 'Back' });
    act(() => {
      fireEvent.click(link);
      fireEvent.click(link);
    });

    expect(screen.getByTestId('path')).toHaveTextContent('/y');
  });

  it('backInApp hides the arrow when opened by link and shows it in the app', () => {
    const { unmount } = mount(['/g']);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull();
    unmount();

    mount(['/x']);
    act(() => {
      void nav('/g');
    });
    const backBtn = screen.getByRole('button', { name: 'Back' });
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(screen.getByTestId('path')).toHaveTextContent('/x');
  });
});
