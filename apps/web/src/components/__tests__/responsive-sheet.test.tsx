import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSheet } from '../ui/responsive-sheet';

/** Answers `(min-width: 640px)` as given; every other query is false. */
function setWide(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /min-width:\s*640px/.test(query) ? wide : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function Harness({ dismissible = true, onOpenChange }: { dismissible?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ResponsiveSheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="Invite people"
        dismissible={dismissible}
      >
        <p>Share this link</p>
      </ResponsiveSheet>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ResponsiveSheet', () => {
  it('renders a bottom drawer named by its title at 375px', async () => {
    setWide(false);
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite people' });
    expect(dialog).toHaveAttribute('data-slot', 'drawer-content');
  });

  it('renders a centred dialog at 1280px', async () => {
    setWide(true);
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite people' });
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
  });

  it('Escape closes it when dismissible', async () => {
    setWide(true);
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('ignores Escape and has no close button when not dismissible', async () => {
    setWide(true);
    const onOpenChange = vi.fn();
    render(<Harness dismissible={false} onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns focus to the opener on close', async () => {
    setWide(true);
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
