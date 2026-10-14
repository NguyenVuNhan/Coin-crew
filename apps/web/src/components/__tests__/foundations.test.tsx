import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';
import { useMediaQuery, useIsWide, useIsCoarsePointer, usePrefersReducedMotion } from '../../lib/media';
import { Screen } from '../Screen';
import { EmptyState } from '../EmptyState';
import { BottomBar } from '../BottomBar';
import { LanguageButton } from '../LanguageButton';
import { Button } from '../Button';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Screen header', () => {
  it('the back arrow navigates inside the app', async () => {
    renderAt(<Screen title="X" back="/trips" />, { route: '/start', path: '/start' });
    expect(screen.getByTestId('location')).toHaveTextContent('/start');
    await userEvent.click(screen.getByRole('link', { name: 'Back' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/trips');
  });

  it('has no language switch unless the screen asks for one', () => {
    renderAt(<Screen title="X" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows what the screen puts on the right', () => {
    renderAt(<Screen title="X" right={<button type="button">Menu</button>} />);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });
});

describe('LanguageButton', () => {
  it('the language icon switches language and names the target', async () => {
    renderAt(<Screen title="X" right={<LanguageButton />} />);
    const button = screen.getByRole('button', { name: 'Switch to Tiếng Việt' });
    expect(button).toHaveAttribute('title', 'Switch to Tiếng Việt');
    await userEvent.click(button);
    const back = screen.getByRole('button', { name: 'Chuyển sang English' });
    expect(back).toHaveAttribute('title', 'Chuyển sang English');
    expect(screen.queryByRole('button', { name: 'Switch to Tiếng Việt' })).not.toBeInTheDocument();
    await userEvent.click(back);
    expect(screen.getByRole('button', { name: 'Switch to Tiếng Việt' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('empty states show their icon, not an alert', () => {
    const { container, rerender } = renderAt(<EmptyState icon="receipt" title="Nothing yet" action={null} />);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    const svg = container.querySelector('.fsl-empty-state svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // The old default was a circled "!"; without an icon there is no picture at all.
    expect(container.querySelector('.fsl-empty-state circle')).toBeNull();
    rerender(<EmptyState title="Nothing yet" action={null} />);
    expect(container.querySelector('.fsl-empty-state svg')).toBeNull();
  });
});

describe('BottomBar', () => {
  it('the bottom bar renders its action', () => {
    renderAt(<Screen title="X" bottomBar={<button type="button">Add expense</button>} />);
    const action = screen.getByRole('button', { name: 'Add expense' });
    expect(action.closest('.fsl-bottom-bar')).not.toBeNull();
  });

  it('is not rendered when the screen has no bottom bar', () => {
    const { container } = renderAt(<Screen title="X" />);
    expect(container.querySelector('.fsl-bottom-bar')).toBeNull();
  });

  it('can be used on its own', () => {
    renderAt(
      <BottomBar>
        <button type="button">Save</button>
      </BottomBar>,
    );
    expect(screen.getByRole('button', { name: 'Save' }).closest('.fsl-bottom-bar')).not.toBeNull();
  });
});

describe('Button links', () => {
  it('an in-app href navigates without leaving the page', async () => {
    renderAt(
      <Button href="/trips" variant="secondary">
        Go
      </Button>,
      { route: '/start', path: '/start' },
    );
    await userEvent.click(screen.getByRole('link', { name: 'Go' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/trips');
  });

  it('server routes and other sites stay plain links', async () => {
    renderAt(
      <>
        <Button href="/api/auth/google/start?returnTo=%2Ftrips">Sign in</Button>
        <Button href="https://example.com/x">Away</Button>
      </>,
      { route: '/start', path: '/start' },
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Ftrips');
    expect(screen.getByRole('link', { name: 'Away' })).toHaveAttribute('href', 'https://example.com/x');
  });
});

describe('media hooks', () => {
  it('are false when matchMedia is missing', () => {
    expect(window.matchMedia).toBeUndefined();
    expect(renderHook(() => useMediaQuery('(min-width: 1024px)')).result.current).toBe(false);
    expect(renderHook(() => useIsWide()).result.current).toBe(false);
    expect(renderHook(() => useIsCoarsePointer()).result.current).toBe(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });

  it('follow the stubbed browser', () => {
    mockMedia({ wide: true, coarse: false, reducedMotion: true });
    expect(renderHook(() => useIsWide()).result.current).toBe(true);
    expect(renderHook(() => useIsCoarsePointer()).result.current).toBe(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
  });
});

describe('design tokens', () => {
  it('fields use the 16px input token', () => {
    // Vitest turns CSS imports (even ?raw) into empty strings, so read the file itself.
    const baseCss = readFileSync(resolve(import.meta.dirname, '../../styles/base.css'), 'utf8');
    expect(baseCss).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*var\(--text-input\)/);
  });
});
